import { PRISMA } from "./prisma-config";

export type MapView = "dinheiro" | "dependencia" | "travados";
export type MapPeriod = "12m" | "semana";
export type MapEdge = {
  unit_id: string;
  raiz_cnpj: string;
  insumo_id: string;
  produto_venda_ficha_id: string;
  prato: string;
  receita_12m: number;
  receita_semana: number;
  peso_custo: number;
  share_fornecedor: number;
  receita_atribuida: number;
  critico: boolean;
  insumo: string;
  categoria: string | null;
  reserva: number;
  ultima_compra: string | null;
  principal_90d: string | null;
  principal_12m: string;
  fornecedor_trocou: boolean;
};
export type MapSupplier = {
  unit_id: string;
  raiz_cnpj: string;
  nome: string;
  gasto_12m: number;
  pct_compras_casa: number;
  pct_compras_grupo: number;
  ranking: number;
  fornecedores_total: number;
  receita_atribuida: number;
  pct_receita: number;
  pratos_dependentes: number;
  pratos_vendidos: number;
  receita_total: number;
  em_aberto: number;
  vencido: number;
  a_vencer: number;
  a_conciliar: number;
  limite_rs: number | null;
  prazo_dias_acordado: number | null;
  disponivel: number | null;
};
export type MapTitle = {
  id: string;
  unit_id: string;
  raiz_cnpj: string;
  dt_vencimento: string | null;
  vl_saldo: number;
  acordo: boolean;
  dias_atraso: number | null;
  ds_parcela: string | null;
};
export type MapBlock = {
  id: string;
  unit_id: string;
  prato_id: string | null;
  inicio: string;
  causa: string | null;
  confirmado: boolean;
  status: string;
  nome: string;
};
export type MapFilters = {
  unit: string;
  period: MapPeriod;
  category: string;
  only86: boolean;
  noReserve: boolean;
};
export const mapView = (v: string | null | undefined): MapView =>
  v === "dependencia" || v === "travados" ? v : "dinheiro";
export const edgeAmount = (e: MapEdge, period: MapPeriod) =>
  period === "semana"
    ? Number(e.receita_semana) *
      Number(e.peso_custo) *
      Number(e.share_fornecedor)
    : Number(e.receita_atribuida);
export const dishKey = (v: {
  unit_id: string;
  produto_venda_ficha_id: string;
}) => `${v.unit_id}:${v.produto_venda_ficha_id}`;
export const blockKey = (v: MapBlock) => `${v.unit_id}:${v.prato_id}`;
export const isCritical = (e: MapEdge) =>
  Number(e.peso_custo) >= PRISMA.mapaCriticalCost;
export function filterMap(edges: MapEdge[], blocks: MapBlock[], f: MapFilters) {
  const blocked = new Set(blocks.map(blockKey));
  return edges.filter(
    (e) =>
      (!f.unit || e.unit_id === f.unit) &&
      (!f.category || e.categoria === f.category) &&
      (!f.only86 || blocked.has(dishKey(e))) &&
      (!f.noReserve || Number(e.reserva) === 0),
  );
}
export function buildFlow(
  edges: MapEdge[],
  blocks: MapBlock[],
  period: MapPeriod,
) {
  const blocked = new Set(blocks.map(blockKey));
  const dishes = new Map<string, { id: string; name: string; value: number }>();
  for (const e of edges) {
    const id = dishKey(e),
      d = dishes.get(id) ?? { id, name: e.prato, value: 0 };
    d.value += edgeAmount(e, period);
    dishes.set(id, d);
  }
  const ranked = [...dishes.values()].sort(
    (a, b) => b.value - a.value || a.id.localeCompare(b.id),
  );
  const top = new Set(ranked.slice(0, 12).map((d) => d.id));
  const targets = ranked.slice(0, 12);
  if (ranked.length > 12)
    targets.push({
      id: "outros",
      name: "Outros pratos",
      value: ranked.slice(12).reduce((s, d) => s + d.value, 0),
    });
  const links = new Map<
    string,
    {
      source: string;
      target: string;
      value: number;
      color: "red" | "amber" | "green";
    }
  >();
  const sources = new Map<string, number>();
  for (const e of edges) {
    const value = edgeAmount(e, period),
      target = top.has(dishKey(e)) ? dishKey(e) : "outros";
    const color = blocked.has(dishKey(e))
      ? "red"
      : Number(e.reserva) === 0
        ? "amber"
        : "green";
    const key = `${e.raiz_cnpj}:${target}:${color}`;
    const link = links.get(key) ?? {
      source: e.raiz_cnpj,
      target,
      value: 0,
      color,
    };
    link.value += value;
    links.set(key, link);
    sources.set(e.raiz_cnpj, (sources.get(e.raiz_cnpj) ?? 0) + value);
  }
  return {
    sources: [...sources]
      .map(([id, value]) => ({ id, value }))
      .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id)),
    targets,
    links: [...links.values()],
    total: [...sources.values()].reduce((a, b) => a + b, 0),
  };
}
export function creditColor(open: number, limit: number | null) {
  if (limit === null) return "neutral";
  if (open > limit) return "red";
  return limit > 0 && open / limit > 0.8 ? "amber" : "green";
}
export function titleTimeline(titles: MapTitle[]) {
  const days = new Map<
    string,
    {
      date: string;
      days: number;
      value: number;
      count: number;
      agreement: boolean;
    }
  >();
  let conciliar = 0,
    outside = 0,
    unknown = 0;
  const seen = new Set<string>();
  for (const t of titles) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    const value = Number(t.vl_saldo),
      days = t.dias_atraso === null ? null : -Number(t.dias_atraso);
    if (days === null || !t.dt_vencimento) {
      unknown += value;
      continue;
    }
    if (days < -120) {
      conciliar += value;
      continue;
    }
    if (days < -100 || days > 45) {
      outside += value;
      continue;
    }
    // One circle per day; any agreement on that day gives a dashed outline.
    const d = daysMap(days, t.dt_vencimento);
    d.value += value;
    d.count++;
    d.agreement ||= t.acordo;
  }
  function daysMap(n: number, date: string) {
    const d = days.get(date) ?? {
      date,
      days: n,
      value: 0,
      count: 0,
      agreement: false,
    };
    days.set(date, d);
    return d;
  }
  return {
    days: [...days.values()].sort((a, b) => a.days - b.days),
    conciliar,
    outside,
    unknown,
    total:
      [...days.values()].reduce((s, d) => s + d.value, 0) +
      conciliar +
      outside +
      unknown,
  };
}
export function aggregateSuppliers(rows: MapSupplier[]) {
  const map = new Map<string, MapSupplier>();
  for (const r of rows) {
    const old = map.get(r.raiz_cnpj);
    if (!old) {
      map.set(r.raiz_cnpj, { ...r });
      continue;
    }
    for (const k of [
      "gasto_12m",
      "receita_atribuida",
      "pratos_dependentes",
      "em_aberto",
      "vencido",
      "a_vencer",
      "a_conciliar",
    ] as const)
      old[k] = Number(old[k]) + Number(r[k]);
  }
  return [...map.values()].sort(
    (a, b) => Number(b.gasto_12m) - Number(a.gasto_12m),
  );
}
