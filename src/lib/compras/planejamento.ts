export const WINDOWS = [4, 8, 12] as const;
export type WindowWeeks = (typeof WINDOWS)[number];
export type Averages = { w4: number | null; w8: number | null; w12: number | null };
export type SalesProduct = Averages & {
  unit_id: string; key: string; name: string; category: string | null;
  ficha_id: string | null; confirmed: boolean; total12: number;
  days86: number; days85: number; first_sale: string;
  weekdays: Array<Averages & { dow: number }>;
};
export type PlanningUnit = {
  id: string; name: string; days4: number; days8: number; days12: number;
  latest: string | null;
};
export type RecipeLine = {
  unit_id: string; ficha_id: string; item_id: string;
  name: string; measure: string | null; quantity: number | null;
};
export type StockPosition = {
  unit_id: string; item_id: string; quantity: number | null;
  measure: string | null; from: string; to: string;
};
export type PlanningData = {
  as_of: string; units: PlanningUnit[]; products: SalesProduct[];
  recipes: RecipeLine[]; stock: StockPosition[];
};
export type IngredientDemand = Averages & {
  key: string; unit_id: string; item_id: string; name: string;
  measure: string | null; dishes: string[]; days86: number;
  stock: StockPosition | null;
};
export function average(row: Averages, weeks: WindowWeeks) { return row[`w${weeks}`]; }
export function buildIngredientDemand(data: PlanningData): IngredientDemand[] {
  const lines = new Map<string, RecipeLine[]>();
  for (const line of data.recipes) {
    const key = `${line.unit_id}:${line.ficha_id}`;
    lines.set(key, [...(lines.get(key) ?? []), line]);
  }
  const stocks = new Map(data.stock.map(s => [`${s.unit_id}:${s.item_id}`, s]));
  const result = new Map<string, IngredientDemand>();
  for (const product of data.products) {
    if (!product.confirmed || !product.ficha_id) continue;
    for (const line of lines.get(`${product.unit_id}:${product.ficha_id}`) ?? []) {
      const key = `${line.unit_id}:${line.item_id}:${line.measure ?? "?"}`;
      const row = result.get(key) ?? {
        key, unit_id: line.unit_id, item_id: line.item_id, name: line.name,
        measure: line.measure, w4: 0, w8: 0, w12: 0, dishes: [], days86: 0,
        stock: stocks.get(`${line.unit_id}:${line.item_id}`) ?? null,
      };
      for (const window of WINDOWS) {
        const field = `w${window}` as const;
        const qty = line.quantity;
        const value = product[field];
        row[field] = row[field] == null || value == null || qty == null || qty < 0 || !Number.isFinite(qty)
          ? null : row[field] + value * qty;
      }
      row.dishes.push(product.name);
      row.days86 += product.days86;
      result.set(key, row);
    }
  }
  return [...result.values()];
}
export function consolidateDemand(rows: IngredientDemand[]) {
  const groups = new Map<string, { key: string; name: string; measure: string | null; rows: IngredientDemand[] }>();
  for (const row of rows) {
    // Only the same canonical Everest item and measure can be consolidated.
    const key = `${row.item_id}:${row.measure ?? "?"}`;
    const group = groups.get(key) ?? { key, name: row.name, measure: row.measure, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()];
}
export function sumDemand(rows: IngredientDemand[], weeks: WindowWeeks): number | null {
  if (!rows.length || rows.some(row => average(row, weeks) == null)) return null;
  return rows.reduce((sum, row) => sum + average(row, weeks)!, 0);
}
export function stockAge(asOf: string, position: StockPosition | null): number | null {
  if (!position?.from) return null;
  return Math.floor((Date.parse(`${asOf}T12:00:00Z`) - Date.parse(`${position.from}T12:00:00Z`)) / 86400000);
}
