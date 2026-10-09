import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyPareto, menuEconomy, completeParetoDishes, paretoCoverage, type ParetoDish } from "../src/lib/compras/prisma-pareto";
import { mapView } from "../src/lib/compras/prisma-mapa";

test("ABC conserves values and shares; crossing bars complete their class", () => {
  const result = classifyPareto([75, 10, 11, 4], n => n, String);
  assert.deepEqual(result.bars.map(b => b.band), ["A", "A", "B", "C"]);
  assert.equal(result.total, 100);
  assert.equal(result.bars.at(-1)?.accumulated, 1);
  assert.ok(Math.abs(Object.values(result.shares).reduce((a, b) => a + b, 0) - 1) < 1e-12);
});
test("unknown amounts remain outside ABC; zero base is explicitly unclassified", () => {
  const result = classifyPareto([null, 0], n => n, String);
  assert.deepEqual(result.unknown, [null]);
  assert.equal(result.bars[0]?.band, null);
  assert.equal(result.bars[0]?.accumulated, null);
});
test("ties are deterministic and duplicate/negative values reject the base", () => {
  const rows = [{ id: "z", n: 5 }, { id: "a", n: 5 }];
  assert.deepEqual(classifyPareto(rows, r => r.n, r => r.id).bars.map(b => b.key), ["a", "z"]);
  assert.throws(() => classifyPareto([-1], n => n, String));
  assert.throws(() => classifyPareto([1, 1], n => n, String));
});
const dish = (unit: string, id: string, amount: number, extra: Partial<ParetoDish> = {}): ParetoDish => ({
  unit_id: unit, produto_id: id, nome: id, receita_12m: amount, receita_atribuida: amount,
  atribuicao_completa: true, insumos_exclusivos: 1, exclusivos_ids: [`item-${id}`], compra_evitavel_12m: 123.45,
  fornecedores_dedicados: 1, boletos_mes: 2, assinatura: false, ...extra,
});
test("economy is class C only, by house, deduplicated, with immediate signature exclusion", () => {
  const rows = [dish("u", "a", 80), dish("u", "b", 16), dish("u", "c", 4), dish("v", "d", 100)];
  const selected = new Set(["u:a", "u:c", "u:c", "v:d"]);
  const result = menuEconomy(rows, selected);
  assert.equal(result.purchase, 123.45);
  assert.equal(result.suppliers, 1);
  assert.equal(result.monthlyBills, 2);
  assert.deepEqual(result.dishes.map(d => d.produto_id), ["c"]);
  assert.equal(menuEconomy(rows.map(d => d.produto_id === "c" ? { ...d, assinatura: true } : d), selected).purchase, 0);
  assert.equal(menuEconomy(rows.map(d => d.produto_id === "c" ? { ...d, atribuicao_completa: false } : d), selected).purchase, 0);
});
test("fourth view is addressable while unknown URLs retain default", () => {
  assert.equal(mapView("pareto"), "pareto");
  assert.equal(mapView("travados"), "travados");
  assert.equal(mapView("invalid"), "dinheiro");
});

test("full house includes unconfirmed products once and measures missing Lorean coverage", () => {
  const known = dish("u", "a", 60);
  const rows = completeParetoDishes([known], [
    { id: "a", unit_id: "u", nome_venda_original: "A", receita_12m: 60 },
    { id: "b", unit_id: "u", nome_venda_original: "B", receita_12m: 40 },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1]?.receita_atribuida, null);
  assert.deepEqual(paretoCoverage(rows), { count: 1, revenue: 100, unknownRevenue: 40, share: .4 });
  const curve = classifyPareto(rows, d => d.receita_atribuida, d => d.produto_id);
  assert.equal(curve.total, 60);
  assert.equal(curve.bars.at(-1)?.accumulated, 1);
  assert.equal(curve.unknown.length, 1);
});
test("house without calculable attribution retains all products and 100% missing revenue", () => {
  const rows = completeParetoDishes([], [{ id: "a", unit_id: "u", nome_venda_original: "A", receita_12m: 50 }]);
  const curve = classifyPareto(rows, d => d.receita_atribuida, d => d.produto_id);
  assert.equal(curve.total, 0);
  assert.equal(curve.bars.length, 0);
  assert.equal(paretoCoverage(rows).share, 1);
  assert.equal(paretoCoverage([]).share, null);
});
