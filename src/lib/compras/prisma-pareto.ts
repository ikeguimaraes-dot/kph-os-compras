export type ParetoClass = "A" | "B" | "C";
export type ParetoDish = {
  unit_id: string; produto_id: string; nome: string; receita_12m: number;
  receita_atribuida: number | null; atribuicao_completa: boolean;
  insumos_exclusivos: number; exclusivos_ids: string[]; compra_evitavel_12m: number;
  fornecedores_dedicados: number; boletos_mes: number; assinatura: boolean;
};
export type ParetoSupplier = {
  unit_id: string; raiz_cnpj: string; nome: string; gasto_12m: number;
  receita_atribuida: number; vencido: number; boletos_mes: number; produto_dedicado: string | null;
};
export type ParetoIngredient = {
  unit_id: string; insumo_id: string; nome: string; categoria: string | null;
  unidade_medida: string | null; compra_12m: number; quantidade_12m: number;
  fornecedores: number; pratos: string[]; principal: string | null; volume_equalizavel: number;
  origens: { raiz_cnpj: string; compra_12m: number; quantidade_12m: number }[];
};
export type ParetoData = { dishes: ParetoDish[]; suppliers: ParetoSupplier[]; ingredients: ParetoIngredient[] };
export const paretoKey = (unit: string, id: string) => `${unit}:${id}`;

export type ParetoProduct = {
  id: string; unit_id: string; nome_venda_original: string; receita_12m: number;
};

/** Keep the full Lorean product population, including unconfirmed bridges. */
export function completeParetoDishes(dishes: ParetoDish[], products: ParetoProduct[]): ParetoDish[] {
  const indexed = new Map(dishes.map(d => [paretoKey(d.unit_id, d.produto_id), d]));
  return products.map(p => indexed.get(paretoKey(p.unit_id, p.id)) ?? {
    unit_id: p.unit_id, produto_id: p.id, nome: p.nome_venda_original, receita_12m: p.receita_12m,
    receita_atribuida: null, atribuicao_completa: false, insumos_exclusivos: 0,
    exclusivos_ids: [], compra_evitavel_12m: 0, fornecedores_dedicados: 0, boletos_mes: 0, assinatura: false,
  });
}

export function paretoCoverage(dishes: ParetoDish[]) {
  const unknown = dishes.filter(d => d.receita_atribuida === null);
  const revenue = dishes.reduce((sum, d) => sum + Number(d.receita_12m), 0);
  const unknownRevenue = unknown.reduce((sum, d) => sum + Number(d.receita_12m), 0);
  return { count: unknown.length, revenue, unknownRevenue, share: revenue > 0 ? unknownRevenue / revenue : null };
}

/** Whole bars: the bar crossing a cut stays in the class that it completes.
 * Values are never rounded before summing. Nulls are reported separately. */
export function classifyPareto<T>(rows: T[], value: (row: T) => number | null, key: (row: T) => string) {
  const known = rows.flatMap(row => {
    const amount = value(row);
    if (amount === null) return [];
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0) throw new Error("Base Pareto inválida: valor negativo ou não finito.");
    return [{ row, value: n, key: key(row) }];
  }).sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
  if (new Set(known.map(r => r.key)).size !== known.length) throw new Error("Base Pareto duplicada.");
  const total = known.reduce((sum, row) => sum + row.value, 0);
  let sum = 0;
  const bars = known.map(row => {
    const before = total ? sum / total : 0;
    sum += row.value;
    const band: ParetoClass | null = !total ? null : before < 0.8 ? "A" : before < 0.95 ? "B" : "C";
    return { ...row, band, accumulated: total ? sum / total : null, share: total ? row.value / total : null };
  });
  const shares = { A: 0, B: 0, C: 0 };
  for (const bar of bars) if (bar.band) shares[bar.band] += bar.share ?? 0;
  return { bars, total, shares, unknown: rows.filter(row => value(row) === null) };
}

/** Signature and unknown attribution are excluded regardless of client selection. */
export function menuEconomy(dishes: ParetoDish[], selected: Set<string>) {
  // Classification must always run over the complete house, never only the selection.
  const houses = new Map<string, ParetoDish[]>();
  for (const dish of dishes) houses.set(dish.unit_id, [...(houses.get(dish.unit_id) ?? []), dish]);
  const eligible = [...houses.values()].flatMap(rows => classifyPareto(rows,
    d => d.receita_atribuida, d => paretoKey(d.unit_id, d.produto_id)).bars)
    .filter(b => b.band === "C" && b.row.atribuicao_completa && !b.row.assinatura && selected.has(b.key));
  return {
    dishes: eligible.map(b => b.row),
    purchase: eligible.reduce((sum, b) => sum + Number(b.row.compra_evitavel_12m), 0),
    suppliers: eligible.reduce((sum, b) => sum + Number(b.row.fornecedores_dedicados), 0),
    monthlyBills: eligible.reduce((sum, b) => sum + Number(b.row.boletos_mes), 0),
  };
}
