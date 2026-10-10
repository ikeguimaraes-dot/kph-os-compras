"use server";
import { unitScope, requiredUnitScope } from "./unit-scope";

import { z } from "zod";
import { comprasAccess } from "./everest-access";
import { createServiceClient } from "@kph/db/supabase/server";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MapEdge, MapSupplier, MapTitle, MapBlock } from "./prisma-mapa";
import { getPrisma } from "./prisma-actions";
import { PRISMA } from "./prisma-config";

const root = z.string().regex(/^\d{8}$/);
const roles = [
  "founder",
  "diretoria",
  "diretor",
  "comprador",
  "cfo",
  "head_financeiro",
];
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const mapPageSize = 200;
const loadMapPage = unstable_cache(
  async (table: string, ids: string[], keys: string[], offset: number) => {
    const service = createServiceClient();
    if (!service) throw new Error("Base indisponível.");
    const db = service as unknown as SupabaseClient;
    let query = db.from(table).select("*").in("unit_id", ids);
    for (const key of keys) query = query.order(key);
    const result = await query.range(offset, offset + mapPageSize - 1);
    if (result.error) throw new Error(result.error.message);
    return result.data;
  },
  ["prisma-mapa-pages-v2"],
  { revalidate: 60 },
);
async function all<T>(
  table: string,
  ids: string[],
  keys: string[],
) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += mapPageSize) {
    const page = await loadMapPage(table, ids, keys, offset);
    rows.push(...(page as T[]));
    if (page.length < mapPageSize) return rows;
  }
}
async function loadMap(ids: string[]) {
    // Scope participates in the cache key. Never cache authentication decisions.
    const [edges, suppliers, titles, blocks] = await Promise.all([
      all<MapEdge>("v_mapa_aresta", ids, [
        "unit_id",
        "produto_venda_ficha_id",
        "insumo_id",
        "raiz_cnpj",
      ]),
      all<MapSupplier>("v_mapa_fornecedor", ids, ["unit_id", "raiz_cnpj"]),
      all<MapTitle>("v_mapa_titulo", ids, ["id"]),
      all<MapBlock>("v_mapa_86", ids, ["id"]),
    ]);
    return {
      edges,
      suppliers,
      titles,
      blocks,
      readAt: new Date().toISOString(),
    };
}

export async function getMap() {
  const { unitIds, units, user } = await comprasAccess();
  const data = await loadMap(unitIds.sort());
  return {
    ...data,
    units,
    today: today(),
    canEditCredit: user.roles.some(
      (r) => roles.includes(r.role.toLowerCase()) && r.unitId === null,
    ),
  };
}
export async function saveMapCredit(raw: unknown) {
  const v = z
    .object({
      raiz_cnpj: root,
      limite_rs: z.number().finite().min(0).max(1e12).nullable(),
      prazo_dias_acordado: z.number().int().min(0).max(365).nullable(),
      observacao: z.string().trim().max(1000),
    })
    .parse(raw);
  const { db, user, unitIds } = await comprasAccess();
  // Credit is group-wide; a house-only role may not change the group's limit.
  if (
    !user.roles.some(
      (r) => r.unitId === null && roles.includes(r.role.toLowerCase()),
    )
  )
    throw new Error(
      "Limite do grupo exige perfil de Compras ou Financeiro com acesso ao grupo.",
    );
  const supplier = await db
    .from("v_mapa_share")
    .select("raiz_cnpj")
    .eq("raiz_cnpj", v.raiz_cnpj)
    .in("unit_id", unitIds)
    .limit(1);
  if (supplier.error || !supplier.data?.length)
    throw new Error("Fornecedor fora do seu acesso.");
  const r = await db
    .from("compras_fornecedor_credito")
    .upsert({
      ...v,
      atualizado_por: user.id,
      atualizado_em: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (r.error) throw new Error(r.error.message);
  return r.data as {
    limite_rs: number | null;
    prazo_dias_acordado: number | null;
    observacao: string;
  };
}
export async function getMapSupplierDetail(raw: {
  root: string;
  unit: string | null;
}) {
  const v = z.object({ root, unit: unitScope }).parse(raw);
  const { db, unitIds } = await comprasAccess(v.unit);
  const [credit, balance] = await Promise.all([
    db
      .from("compras_fornecedor_credito")
      .select("limite_rs,prazo_dias_acordado,observacao")
      .eq("raiz_cnpj", v.root)
      .maybeSingle(),
    db
      .from("v_mapa_fornecedor")
      .select("unit_id,raiz_cnpj")
      .in("unit_id", unitIds)
      .eq("raiz_cnpj", v.root)
      .limit(1),
  ]);
  if (balance.error || !balance.data?.length)
    throw new Error("Fornecedor fora do seu acesso.");
  if (credit.error) throw new Error(credit.error.message);
  const groups = await db
    .from("compras_fornecedor_grupo")
    .select("raiz_cnpj")
    .eq("grupo_id", v.root);
  if (groups.error) throw new Error(groups.error.message);
  const roots = new Set([v.root, ...groups.data.map((g) => g.raiz_cnpj)]);
  const end = today(),
    start = new Date(`${end}T12:00:00Z`);
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  const analysis = await getPrisma({
    unitId: v.unit,
    start: start.toISOString().slice(0, 10),
    end,
  });
  const suppliers = analysis.suppliers.filter((s) => roots.has(s.root)),
    spend = suppliers.reduce((s, v) => s + v.spend, 0);
  const known = suppliers.filter((s) => s.score !== null),
    weight = known.reduce((s, v) => s + v.spend, 0);
  const score = weight
    ? known.reduce((s, v) => s + v.score! * v.spend, 0) / weight
    : null;
  const map = await loadMap(unitIds.sort());
  const revenue = map.suppliers
    .filter((s) => s.raiz_cnpj === v.root)
    .reduce((s, v) => s + Number(v.receita_atribuida), 0);
  const profile =
    revenue <= 0
      ? "Sem ficha suficiente"
      : revenue >= PRISMA.anchorRevenue
        ? score === null
          ? "Âncora · nota não medida"
          : score < PRISMA.fragileScore
            ? "Âncora frágil"
            : "Âncora"
        : spend >= PRISMA.falseAnchorSpend && revenue < spend
          ? "Falso âncora"
          : "Complementar";
  return { credit: credit.data, profile, score };
}
export async function createMapAgreement(raw: { root: string; unit: string }) {
  const v = z.object({ root, unit: requiredUnitScope }).parse(raw);
  const { db, user } = await comprasAccess(v.unit, "write");
  if (
    !user.roles.some(
      (r) =>
        roles.includes(r.role.toLowerCase()) &&
        (r.unitId === null || r.unitId === v.unit),
    )
  )
    throw new Error("Seu perfil não pode abrir acordos.");
  const map = await loadMap([v.unit]);
  const supplier = map.suppliers.find((s) => s.raiz_cnpj === v.root);
  if (!supplier) throw new Error("Fornecedor fora da casa.");
  // Only confirmed links can be proposed as releases; suggestions stay in the operational queue.
  const blocked = await db
    .from("abastecimento_86")
    .select("produto_venda_ficha_id")
    .eq("unit_id", v.unit)
    .not("status", "in", "(retomado,planejado)")
    .not("produto_venda_ficha_id", "is", null);
  if (blocked.error) throw new Error(blocked.error.message);
  const ids = new Set(blocked.data.map((b) => b.produto_venda_ficha_id));
  const dishes = [
    ...new Set(
      map.edges
        .filter(
          (e) => e.raiz_cnpj === v.root && ids.has(e.produto_venda_ficha_id),
        )
        .map((e) => e.produto_venda_ficha_id),
    ),
  ];
  if (!dishes.length)
    throw new Error(
      "Confirme os pratos na fila de 86 antes de abrir um acordo.",
    );
  const contributions = await db
    .from("v_abastecimento_contribuicao")
    .select("produto_venda_ficha_id,contribuicao_dia")
    .eq("unit_id", v.unit)
    .in("produto_venda_ficha_id", dishes);
  if (contributions.error) throw new Error(contributions.error.message);
  const values = new Map(
    contributions.data.map((c) => [
      c.produto_venda_ficha_id,
      c.contribuicao_dia,
    ]),
  );
  const daily = dishes.every((id) => values.get(id) != null)
    ? dishes.reduce((s, id) => s + Math.max(0, Number(values.get(id))), 0)
    : null;
  const r = await db
    .from("abastecimento_acordo")
    .insert({
      unit_id: v.unit,
      fornecedor_raiz: v.root,
      pratos_liberados: dishes,
      entrada_divida_rs: Number(supplier.vencido),
      compra_nova_rs: 0,
      frete_rs: 0,
      status: "rascunho",
      contribuicao_recuperavel_7d: daily === null ? null : daily * 7,
      contribuicao_recuperavel_14d: daily === null ? null : daily * 14,
      criado_por: user.id,
    })
    .select("id")
    .single();
  if (r.error) throw new Error(r.error.message);
  return { id: r.data.id };
}
