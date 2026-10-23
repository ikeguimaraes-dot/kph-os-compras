import test from "node:test";
import assert from "node:assert/strict";
import { buildIngredientDemand, consolidateDemand, sumDemand, stockAge, type PlanningData, type SalesProduct } from "../src/lib/compras/planejamento";

function product(unit: string, name: string, recipe: string, qty: number | null): SalesProduct {
  return { unit_id: unit, key: name, name, category: null, ficha_id: recipe, confirmed: true,
    w4: qty, w8: qty, w12: qty, total12: (qty ?? 0) * 12, days86: 0, days85: 0, first_sale: "2026-09-01", weekdays: [] };
}
function fixture(): PlanningData {
  return { as_of: "2026-10-22", units: [], stock: [], products: [product("meet", "Prato A", "a", 200), product("meet", "Prato B", "b", 100), product("madonna", "Prato C", "c", 50)],
    recipes: [{ unit_id: "meet", ficha_id: "a", item_id: "mignon", name: "Mignon", measure: "KG", quantity: 0.2 },
      { unit_id: "meet", ficha_id: "b", item_id: "mignon", name: "Mignon", measure: "KG", quantity: 0.1 },
      { unit_id: "madonna", ficha_id: "c", item_id: "mignon", name: "Mignon", measure: "KG", quantity: 0.2 }] };
}
test("sums consumption across dishes, preserves houses, and consolidates once", () => {
  const rows = buildIngredientDemand(fixture());
  assert.equal(rows.length, 2);
  assert.equal(rows.find(r => r.unit_id === "meet")!.w8, 50);
  assert.equal(rows.find(r => r.unit_id === "madonna")!.w8, 10);
  const groups = consolidateDemand(rows);
  assert.equal(groups.length, 1);
  assert.equal(sumDemand(groups[0]!.rows, 8), 60);
  assert.equal(rows[0]!.stock, null);
});
test("does not turn an unknown amount into zero or a partial numeric total", () => {
  const data = fixture(); data.products[1]!.w8 = null;
  const rows = buildIngredientDemand(data);
  assert.equal(rows[0]!.w8, null);
  assert.equal(sumDemand(rows, 8), null);
  assert.equal(sumDemand(rows, 4), 60);
});
test("unconfirmed recipes never inflate ingredient demand", () => {
  const data = fixture(); data.products[0]!.confirmed = false;
  assert.equal(buildIngredientDemand(data)[0]!.w4, 10);
});
test("same name with different canonical IDs or measures is not consolidated", () => {
  const data = fixture(); data.recipes[2]!.measure = "UN";
  assert.equal(consolidateDemand(buildIngredientDemand(data)).length, 2);
  data.recipes[2]!.measure = "KG"; data.recipes[2]!.item_id = "other-cut";
  assert.equal(consolidateDemand(buildIngredientDemand(data)).length, 2);
});
test("stock age uses the oldest contributing depot and unknown stock stays unknown", () => {
  assert.equal(stockAge("2026-10-22", { unit_id: "meet", item_id: "mignon", quantity: 20, measure: "KG", from: "2026-09-30", to: "2026-10-21" }), 22);
  assert.equal(stockAge("2026-10-22", null), null);
});
test("independent windows are not averaged or added to each other", () => {
  const data = fixture(); data.products = [product("meet", "Prato", "a", 100)];
  data.products[0]!.w8 = 200; data.products[0]!.w12 = 300;
  const rows = buildIngredientDemand(data);
  assert.equal(sumDemand(rows, 4), 20); assert.equal(sumDemand(rows, 8), 40); assert.equal(sumDemand(rows, 12), 60);
});
