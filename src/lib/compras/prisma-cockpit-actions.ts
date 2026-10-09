"use server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { optionalPrismaQuery } from "./prisma-optional-query";
import { comprasAccess } from "./everest-access";
import { getPrisma, listPrismaPlan } from "./prisma-actions";
import {
  buildCockpit,
  shiftMonth,
  monthEnd,
  displayName,
  type MonthRow,
  type DishRow,
  type PurchaseRow,
  type AlertRow,
} from "./prisma-cockpit";
const unitScope = z.preprocess(
  (v) => (typeof v === "string" && !z.uuid().safeParse(v).success ? null : v),
  z.uuid().nullable(),
);
const filterSchema = z.object({
  unitId: unitScope,
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/),
  comparison: z.enum(["previous", "year"]),
});
export type CockpitFilter = z.infer<typeof filterSchema>;
async function readRows<T>(
  db: SupabaseClient,
  table: string,
  unitIds: string[],
  start?: string,
  end?: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    let q = db.from(table).select("*").in("unit_id", unitIds).order("unit_id");
    if (start) q = q.gte("mes", start).lte("mes", end!).order("mes");
    if (
      table === "mv_prisma_prato_mes" ||
      table === "v_abastecimento_engenharia"
    )
      q = q.order("nome_venda");
    if (table === "mv_prisma_compra_mes")
      q = q.order("item_id").order("raiz_cnpj");
    if (table === "mv_fornecedor_ancora") q = q.order("raiz_cnpj");
    if (table === "compras_metas_responsavel") q = q.order("dono");
    if (table === "v_prisma_alertas")
      q = q.order("data").order("tipo").order("alvo");
    const { data, error } = await q.range(offset, offset + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if ((data?.length ?? 0) < 1000) return out;
  }
}
export async function getCockpit(raw: CockpitFilter) {
  const f = filterSchema.parse(raw);
  const { db, user, units, unitIds } = await comprasAccess(f.unitId);
  const now = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (f.month > shiftMonth(now, 0) || f.month < shiftMonth(now, -23))
    throw new Error("Selecione um mês dos últimos 24 meses.");
  const [
    months,
    dishes,
    purchases,
    alerts,
    analysis,
    plan,
    names,
    anchors,
    refresh,
    ownerTargets,
    completeness,
    inventory,
    missingStock,
    availability,
    roles,
    supplyAlerts,
  ] = await Promise.all([
    readRows<MonthRow>(
      db,
      "v_prisma_margem_mes",
      unitIds,
      shiftMonth(f.month, -12),
      f.month,
    ),
    readRows<DishRow>(
      db,
      "mv_prisma_prato_mes",
      unitIds,
      shiftMonth(f.month, -12),
      f.month,
    ),
    readRows<PurchaseRow>(
      db,
      "mv_prisma_compra_mes",
      unitIds,
      shiftMonth(f.month, -23),
      f.month,
    ),
    readRows<AlertRow>(db, "v_prisma_alertas", unitIds),
    getPrisma({
      unitId: f.unitId,
      start: shiftMonth(f.month, -11),
      end: monthEnd(f.month),
    }),
    listPrismaPlan(f.unitId),
    db
      .from("compras_fornecedor_apelido")
      .select("raiz_cnpj,apelido")
      .limit(5000),
    readRows<{
      unit_id: string;
      mes: string;
      raiz_cnpj: string;
      receita_dependente_rs: number;
      cobertura_receita: number;
    }>(db, "mv_fornecedor_ancora", unitIds, shiftMonth(f.month, -11), f.month),
    db
      .from("prisma_refresh_log")
      .select("concluido_em,erro")
      .eq("etapa", "cockpit")
      .order("id", { ascending: false })
      .limit(1),
    readRows<{
      unit_id: string;
      mes: string;
      dono: string;
      economia_meta_rs: number;
    }>(
      db,
      "compras_metas_responsavel",
      unitIds,
      `${f.month.slice(0, 4)}-01-01`,
      f.month,
    ),
    readRows<{
      unit_id: string;
      mes: string;
      notas_incompletas: boolean | null;
      receita_parcial: boolean | null;
      pct_completo: number | null;
    }>(
      db,
      "v_prisma_completude_mes",
      unitIds,
      shiftMonth(f.month, -12),
      f.month,
    ),
    db
      .from("v_prisma_estoque_fechamento")
      .select("*")
      .in("unit_id", unitIds)
      .gte("dia", shiftMonth(f.month, -1))
      .lte("dia", monthEnd(f.month)),
    db
      .from("v_prisma_estoque_item")
      .select(
        "unit_id,dia,deposito,descricao_item,unidade_medida,quantidade,fonte_custo",
      )
      .in("unit_id", unitIds)
      .gte("dia", shiftMonth(f.month, -1))
      .lte("dia", monthEnd(f.month))
      .gt("quantidade", 0)
      .is("custo_unitario", null)
      .order("dia")
      .order("descricao_item")
      .limit(500),
    optionalPrismaQuery(
      () =>
        readRows<{
          unit_id: string;
          mes: string;
          nome_venda: string;
          dias_disponiveis: number;
          qtd_disponivel: number;
          disponibilidade_conhecida: boolean;
        }>(db, "v_abastecimento_engenharia", unitIds, f.month, f.month),
      "A disponibilidade dos pratos não carregou. A engenharia permanece a validar; tente recarregar.",
    ),
    db
      .from("cardapio_papel")
      .select(
        "produto_venda_ficha_id,papel,produto_venda_ficha(nome_venda,unit_id)",
      )
      .in("unit_id", unitIds),
    optionalPrismaQuery(
      () => readRows<AlertRow>(db, "v_abastecimento_alertas", unitIds),
      "Os alertas de abastecimento não carregaram. Confira a fila antes de decidir.",
    ),
  ]);
  if (roles.error) throw new Error(roles.error.message);
  const exposures = new Map(
    availability.rows.map((r) => [`${r.unit_id}|${r.mes}|${r.nome_venda}`, r]),
  );
  const brandRoles = new Map(
    (roles.data ?? []).map((r) => {
      const b = r.produto_venda_ficha as unknown as {
        unit_id: string;
        nome_venda: string;
      };
      return [`${b.unit_id}|${b.nome_venda}`, r.papel];
    }),
  );
  if (inventory.error || missingStock.error)
    throw new Error(inventory.error?.message ?? missingStock.error?.message);
  const quality = new Map(
    completeness.map((r) => [`${r.unit_id}|${r.mes}`, r]),
  );
  if (names.error || refresh.error)
    throw new Error(names.error?.message ?? refresh.error?.message);
  const aliases = Object.fromEntries(
    (names.data ?? []).map((r) => [r.raiz_cnpj, r.apelido]),
  );
  const cleanAnalysis = {
    ...analysis,
    suppliers: analysis.suppliers.map((s) => ({
      ...s,
      name: aliases[s.root] ?? displayName(s.name),
    })),
  };
  const visibleUnits = units.filter((u) => unitIds.includes(u.id));
  const result = buildCockpit({
    month: f.month,
    comparison: f.comparison,
    units: visibleUnits,
    months: months.map((r) => ({
      ...r,
      ...quality.get(`${r.unit_id}|${r.mes}`),
    })),
    dishes: dishes.map((d) => ({
      ...d,
      ...exposures.get(`${d.unit_id}|${d.mes}|${d.nome_venda}`),
      disponibilidade_conhecida:
        exposures.get(`${d.unit_id}|${d.mes}|${d.nome_venda}`)
          ?.disponibilidade_conhecida ?? false,
      papel: brandRoles.get(`${d.unit_id}|${d.nome_venda}`) ?? null,
    })),
    purchases,
    captures: plan.rows,
    ownerTargets,
    alerts: [...alerts, ...supplyAlerts.rows],
    analysis: cleanAnalysis,
    aliases,
    anchors,
    refresh: refresh.data?.[0]?.erro
      ? null
      : (refresh.data?.[0]?.concluido_em ?? null),
    canEdit: user.roles.some(
      (r) =>
        ["founder", "diretoria"].includes(r.role) &&
        (r.unitId === null || r.unitId === f.unitId),
    ),
  });
  // Candidate alerts from another house may only name a house this user can see.
  const allowed = new Set(units.map((u) => u.id));
  result.alerts = result.alerts.map((a) => ({
    ...a,
    outra_unit_id:
      a.outra_unit_id && allowed.has(a.outra_unit_id) ? a.outra_unit_id : null,
  }));
  return {
    ...result,
    warnings: [availability.warning, supplyAlerts.warning].filter(
      (w): w is string => w !== null,
    ),
    stockClosings: inventory.data ?? [],
    stockMissing: missingStock.data ?? [],
  };
}
export async function saveCockpitTarget(raw: {
  unitId: string;
  month: string;
  cmv: number | null;
  savings: number | null;
}) {
  const v = z
    .object({
      unitId: z.uuid(),
      month: filterSchema.shape.month,
      cmv: z.number().min(0).max(100).nullable(),
      savings: z.number().min(0).max(1e12).nullable(),
    })
    .parse(raw);
  const { db, user } = await comprasAccess(v.unitId);
  if (
    !user.roles.some(
      (r) =>
        ["founder", "diretoria"].includes(r.role) &&
        (r.unitId === null || r.unitId === v.unitId),
    )
  )
    throw new Error("Somente founder ou diretoria podem editar metas.");
  const { error } = await db.from("compras_metas").upsert({
    unit_id: v.unitId,
    mes: v.month,
    cmv_meta_pct: v.cmv,
    economia_meta_rs: v.savings,
    atualizado_por: user.id,
    atualizado_em: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function saveOwnerTarget(raw: {
  unitId: string;
  month: string;
  owner: string;
  savings: number;
}) {
  const v = z
    .object({
      unitId: z.uuid(),
      month: filterSchema.shape.month,
      owner: z.string().trim().min(1).max(120),
      savings: z.number().min(0).max(1e12),
    })
    .parse(raw);
  const { db, user } = await comprasAccess(v.unitId);
  if (
    !user.roles.some(
      (r) =>
        ["founder", "diretoria"].includes(r.role) &&
        (r.unitId === null || r.unitId === v.unitId),
    )
  )
    throw new Error("Somente founder ou diretoria podem editar metas.");
  const { error } = await db.from("compras_metas_responsavel").upsert({
    unit_id: v.unitId,
    mes: v.month,
    dono: v.owner,
    economia_meta_rs: v.savings,
    atualizado_por: user.id,
    atualizado_em: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}
export async function saveSupplierAlias(raw: {
  root: string;
  name: string;
  unitId: string | null;
}) {
  const v = z
    .object({
      root: z.string().min(1).max(120),
      name: z.string().trim().min(1).max(120),
      unitId: z.uuid().nullable(),
    })
    .parse(raw);
  const { db, user, unitIds } = await comprasAccess(v.unitId);
  if (
    !user.roles.some(
      (r) =>
        ["founder", "diretoria"].includes(r.role) &&
        (r.unitId === null || r.unitId === v.unitId),
    )
  )
    throw new Error("Somente founder ou diretoria podem editar apelidos.");
  const found = await db
    .from("mv_prisma_compra_mes")
    .select("raiz_cnpj")
    .eq("raiz_cnpj", v.root)
    .in("unit_id", unitIds)
    .limit(1);
  if (found.error || !found.data?.length)
    throw new Error("Fornecedor fora do seu acesso.");
  const { error } = await db.from("compras_fornecedor_apelido").upsert({
    raiz_cnpj: v.root,
    apelido: v.name,
    origem: "manual",
    atualizado_por: user.id,
    atualizado_em: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}
export async function addMenuPlan(raw: {
  unitId: string;
  month: string;
  name: string;
}) {
  const v = z
    .object({
      unitId: z.uuid(),
      month: filterSchema.shape.month,
      name: z.string().min(1).max(500),
    })
    .parse(raw);
  const { db, user } = await comprasAccess(v.unitId);
  const row = await db
    .from("mv_prisma_prato_mes")
    .select("nome,receita")
    .eq("unit_id", v.unitId)
    .eq("mes", v.month)
    .eq("nome_venda", v.name)
    .single();
  if (row.error || !row.data)
    throw new Error("Prato não encontrado no período.");
  const { error } = await db.from("compras_plano_acao").upsert(
    {
      unit_id: v.unitId,
      tipo: "Cardápio",
      alvo: v.name,
      titulo: `Revisar margem e posicionamento: ${displayName(row.data.nome)}`,
      rs_em_jogo: 0,
      criado_por: user.id,
    },
    { onConflict: "unit_id,tipo,alvo", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}

export async function getCompleteMonths() {
  const { db, units, unitIds } = await comprasAccess();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const end = shiftMonth(today, -1);
  const rows = await readRows<{
    unit_id: string;
    mes: string;
    notas_incompletas: boolean | null;
    receita_parcial: boolean | null;
  }>(db, "v_prisma_completude_mes", unitIds, shiftMonth(end, -23), end);
  const map: Record<string, string | null> = {};
  for (const u of units)
    map[u.id] =
      rows
        .filter(
          (r) =>
            r.unit_id === u.id &&
            r.notas_incompletas === false &&
            r.receita_parcial === false,
        )
        .map((r) => r.mes)
        .sort()
        .at(-1) ?? null;
  map.all =
    [...new Set(rows.map((r) => r.mes))]
      .filter((m) =>
        unitIds.every((id) =>
          rows.some(
            (r) =>
              r.unit_id === id &&
              r.mes === m &&
              r.notas_incompletas === false &&
              r.receita_parcial === false,
          ),
        ),
      )
      .sort()
      .at(-1) ?? null;
  return { units, months: map, fallback: end };
}
