"use server";
import { z } from "zod";
import { supplierAction } from "./prisma-config";
import { unstable_cache } from "next/cache";
import {
  createServiceClient,
  createSupabaseServerClient,
} from "@kph/db/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { comprasAccess } from "./everest-access";
import { analyzePrisma, type Line, type Term } from "./prisma-engine";

const date = z.iso.date();
const filterSchema = z
  .object({ unitId: z.uuid().nullable(), start: date, end: date })
  .refine((v) => v.start <= v.end, "Período inválido.")
  .refine(
    (v) =>
      new Date(v.end).getTime() - new Date(v.start).getTime() <=
      3 * 366 * 86400000,
    "Selecione até três anos.",
  );
export type PrismaFilter = z.infer<typeof filterSchema>;
export type Plan = {
  id: string;
  unit_id: string | null;
  tipo: string;
  titulo: string;
  alvo: string;
  rs_em_jogo: number;
  dono: string;
  prazo: string | null;
  status: "aberta" | "em negociação" | "capturada" | "descartada";
  capturado_rs: number;
  criado_por: string;
  criado_em: string;
  atualizado_em: string;
};
type Anchor = {
  unit_id: string;
  mes: string;
  raiz_cnpj: string;
  fornecedor_nome: string;
  comprado_rs: number;
  consumo_teorico_rs: number;
  receita_dependente_rs: number;
  pratos: number;
  cobertura_receita: number;
  atualizado_em: string;
};
type Coverage = {
  unit_id: string;
  receita_total: number;
  receita_confirmada: number;
  receita_resolvida: number;
  pendentes: number;
};
type Diagnostic = {
  unit_id: string;
  item_id: string;
  item_nome: string;
  unidade_medida: string;
  comprado_rs: number;
  consumo_parcial_rs: number | null;
  diferenca_rs: number;
  sem_preco: boolean;
};

async function groupPermission() {
  const client = await createSupabaseServerClient();
  if (!client) return false;
  const { data, error } = await (client as unknown as SupabaseClient).rpc(
    "compras_pode_plano",
    { p_unit: null },
  );
  if (error) throw new Error(error.message);
  return data === true;
}
async function loadAnalysis(unitIds: string[], start: string, end: string) {
  const service = createServiceClient();
  if (!service) throw new Error("Base indisponível.");
  const db = service as unknown as SupabaseClient;
  const lines: Line[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from("v_prisma_linhas")
      .select("*")
      .in("unit_id", unitIds)
      .gte("data", start)
      .lte("data", end)
      .order("id")
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    lines.push(...((data ?? []) as Line[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  const terms: Term[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from("everest_titulos_fornecedor")
      .select(
        "id,vl_titulo,dt_documento,dt_vencimento,everest_fornecedores!fornecedor_id(id,cpf_cnpj)",
      )
      .in("unit_id", unitIds)
      .gte("dt_documento", start)
      .lte("dt_documento", end)
      .gt("vl_titulo", 0)
      .order("id")
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const f = (
        Array.isArray(row.everest_fornecedores)
          ? row.everest_fornecedores[0]
          : row.everest_fornecedores
      ) as { id: string; cpf_cnpj: string } | null;
      if (!f || !row.dt_documento || !row.dt_vencimento) continue;
      const digits = (f.cpf_cnpj ?? "").replace(/\D/g, "");
      const root =
        digits.length === 14
          ? digits.slice(0, 8)
          : digits.length === 11
            ? digits
            : `sem-cnpj:${f.id}`;
      const days =
        (new Date(row.dt_vencimento).getTime() -
          new Date(row.dt_documento).getTime()) /
        86400000;
      if (Number.isFinite(days) && days >= 0)
        terms.push({ root, days, value: Number(row.vl_titulo) });
    }
    if ((data?.length ?? 0) < 1000) break;
  }
  return analyzePrisma(lines, terms, start, end);
}
const cachedAnalysis = unstable_cache(loadAnalysis, ["prisma-v1"], {
  revalidate: 60,
});
export async function getPrisma(raw: PrismaFilter) {
  const filter = filterSchema.parse(raw);
  const { unitIds } = await comprasAccess(filter.unitId);
  return cachedAnalysis(unitIds.sort(), filter.start, filter.end);
}
export async function getPrismaAnchors(unitId: string | null) {
  const { db, unitIds, units } = await comprasAccess(unitId);
  const rows: Anchor[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from("mv_fornecedor_ancora")
      .select("*")
      .in("unit_id", unitIds)
      .order("unit_id")
      .order("mes")
      .order("raiz_cnpj")
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Anchor[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  const [coverage, diagnostics] = await Promise.all([
    db.from("v_ponte_cobertura").select("*").in("unit_id", unitIds),
    db
      .from("v_ancora_diagnostico")
      .select(
        "unit_id,item_id,item_nome,unidade_medida,comprado_rs,consumo_parcial_rs,diferenca_rs,sem_preco",
      )
      .in("unit_id", unitIds)
      .order("diferenca_rs", { ascending: false })
      .limit(10),
  ]);
  if (coverage.error || diagnostics.error)
    throw new Error(coverage.error?.message ?? diagnostics.error?.message);
  return {
    rows,
    coverage: (coverage.data ?? []) as Coverage[],
    diagnostics: (diagnostics.data ?? []) as Diagnostic[],
    units: units.filter((u) => unitIds.includes(u.id)),
  };
}
export async function listPrismaPlan(unitId: string | null) {
  const { db, unitIds } = await comprasAccess(unitId);
  const canGroup = await groupPermission();
  let q = db
    .from("compras_plano_acao")
    .select("*")
    .order("criado_em", { ascending: false });
  q =
    canGroup && !unitId
      ? q.or(`unit_id.in.(${unitIds.join(",")}),unit_id.is.null`)
      : q.in("unit_id", unitIds);
  const { data, error } = await q.limit(1000);
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as Plan[], canGroup };
}
export async function addPrismaPlan(raw: {
  filter: PrismaFilter;
  root?: string;
  process?: boolean;
}) {
  const filter = filterSchema.parse(raw.filter);
  const { db, user } = await comprasAccess(filter.unitId);
  if (!filter.unitId && !(await groupPermission()))
    throw new Error(
      "Plano do grupo exige acesso a todas as casas. Selecione uma casa.",
    );
  const analysis = await getPrisma(filter);
  const supplier = analysis.suppliers.find((s) => s.root === raw.root);
  if (!raw.process && !supplier)
    throw new Error("Fornecedor não encontrado no período.");
  const tipo = raw.process ? "processo" : "negociação",
    alvo = raw.process ? "pedido-antes-nota" : supplier!.root;
  const titulo = raw.process
    ? "Exigir pedido de compra antes da nota"
    : `${supplierAction(supplier!)}: ${supplier!.name}`;
  const { error } = await db.from("compras_plano_acao").upsert(
    {
      unit_id: filter.unitId,
      tipo,
      alvo,
      titulo,
      rs_em_jogo: raw.process ? 0 : supplier!.overpaid,
      criado_por: user.id,
    },
    { onConflict: "unit_id,tipo,alvo", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
  return { titulo };
}
export async function updatePrismaPlan(raw: {
  id: string;
  version: string;
  dono: string;
  prazo: string | null;
  status: Plan["status"];
  capturado_rs: number;
}) {
  const v = z
    .object({
      id: z.uuid(),
      version: z.iso.datetime({ offset: true }),
      dono: z.string().trim().max(120),
      prazo: date.nullable(),
      status: z.enum(["aberta", "em negociação", "capturada", "descartada"]),
      capturado_rs: z.number().finite().min(0).max(999999999999),
    })
    .parse(raw);
  const { db, unitIds } = await comprasAccess();
  const { data: row, error } = await db
    .from("compras_plano_acao")
    .select("unit_id")
    .eq("id", v.id)
    .single();
  if (error || !row) throw new Error("Ação não encontrada.");
  if (row.unit_id ? !unitIds.includes(row.unit_id) : !(await groupPermission()))
    throw new Error("Ação fora do seu acesso.");
  const { data, error: updateError } = await db
    .from("compras_plano_acao")
    .update({
      dono: v.dono,
      prazo: v.prazo,
      status: v.status,
      capturado_rs: v.capturado_rs,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", v.id)
    .eq("atualizado_em", v.version)
    .select("id");
  if (updateError) throw new Error(updateError.message);
  if (!data?.length)
    throw new Error(
      "Outra pessoa atualizou esta ação. Recarregue antes de salvar.",
    );
}
