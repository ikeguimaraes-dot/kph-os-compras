import { test } from "node:test";
import assert from "node:assert/strict";
import { includeFixedItems, weeklyPurchaseQuantity } from "../src/lib/compras/compra-fixa-semanal";

test("compra semanal preserva 25 kg e 3 kg mesmo com estoque alto ou limite inferior", () => {
  for (const stock of [null, 0, 10, 100]) {
    assert.equal(weeklyPurchaseQuantity(6, stock, 25), 25);
    assert.equal(weeklyPurchaseQuantity(1, stock, 3), 3);
  }
  assert.equal(weeklyPurchaseQuantity(100, 0, 3), 3);
});
test("itens sem compra fixa mantêm cálculo anterior e inválidos não viram compra", () => {
  assert.equal(weeklyPurchaseQuantity(6, 2, null), 4);
  assert.equal(weeklyPurchaseQuantity(6, 10, undefined), 0);
  assert.equal(weeklyPurchaseQuantity(6, null, null), 6);
  for (const invalid of [0, -1, NaN, Infinity]) assert.throws(() => weeklyPurchaseQuantity(6, 0, invalid));
});
test("compra fixa não desaparece sem tendência ou mínimo, nem duplica histórico", () => {
  const policies = new Map([["fixed", { compra_fixa_semanal: 25 }], ["normal", { compra_fixa_semanal: null }]]);
  assert.deepEqual(includeFixedItems([], policies, insumo_id => ({ insumo_id })), [{ insumo_id: "fixed" }]);
  assert.deepEqual(includeFixedItems([{ insumo_id: "fixed" }, { insumo_id: "blocked" }], policies, insumo_id => ({ insumo_id })), [{ insumo_id: "fixed" }]);
});
