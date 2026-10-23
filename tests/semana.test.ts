import assert from "node:assert/strict";
import { test } from "node:test";
import { consolidateProposals, mappedProducts, netProposal, operationalRows, targetWeek, type ReviewInput, type WeekSnapshot, type WeekReview } from "../src/lib/compras/semana";

const unit = "11111111-1111-4111-8111-111111111111";
const snapshotId = "22222222-2222-4222-8222-222222222222";
function snapshot(): WeekSnapshot { return { id: snapshotId, week_start: "2026-10-26", review_date: "2026-10-23", unit_id: unit, created_at: "2026-10-23T12:00:00Z", open_orders: [], planning: {
  as_of: "2026-10-23", units: [{ id: unit, name: "Casa teste", days4: 28, days8: 56, days12: 84, latest: "2026-10-22" }],
  products: [{ unit_id: unit, key: "PRATO", name: "Prato", category: null, ficha_id: "f1", confirmed: true, total12: 120, days86: 1, days85: 0, first_sale: "2026-08-01", weekdays: [], w4: 20, w8: 15, w12: 10 }],
  recipes: [{ unit_id: unit, ficha_id: "f1", item_id: "i1", name: "Insumo", measure: "KG", quantity: 0.2 }],
  stock: [{ unit_id: unit, item_id: "i1", measure: "KG", quantity: 100, from: "2026-08-31", to: "2026-08-31" }],
} }; }
function review(): ReviewInput { return { snapshot_id: snapshotId, unit_id: unit, item_key: `${unit}:i1:KG`, demand: 10, demand_note: "Demanda validada com fichas e aproveitamento", opening_stock: 2, stock_note: "Projeção de segunda após consumo do fim de semana", incoming: 1, incoming_note: "Pedido confirmado antes da abertura, fora do estoque", safety: 1, safety_note: "Segurança revisada com responsável da casa", pack: 3, pack_note: "Embalagem conferida no fornecedor e cadastro", checked: true }; }
test("sexta e segunda apontam para a mesma semana, inclusive virada de mês", () => {
  assert.equal(targetWeek("2026-10-23"), "2026-10-26"); assert.equal(targetWeek("2026-10-26"), "2026-10-26");
  assert.equal(targetWeek("2026-10-30"), "2026-11-02"); assert.equal(targetWeek("2026-11-01"), "2026-11-02");
});
test("estoque antigo não vira saldo líquido nem 86 vira multiplicador", () => {
  const rows = operationalRows(snapshot()); assert.equal(rows[0]!.priority, 0); assert.equal(rows[0]!.w4, 4);
  assert.deepEqual(rows[0]!.reference, { window: 8, quantity: 3 }); assert.equal(netProposal(null), null);
  assert.equal(consolidateProposals(rows, [])[0]!.quantity, null);
});
test("janelas inválidas não são transformadas em zero", () => {
  const s = snapshot(); s.planning.products[0]!.w8 = null; s.planning.products[0]!.w12 = null;
  assert.deepEqual(operationalRows(s)[0]!.reference, { window: 4, quantity: 4 });
  s.planning.products[0]!.w4 = null; assert.equal(operationalRows(s)[0]!.reference, null);
});
test("compra arredonda a embalagem depois de segurança, estoque e entregas; zero é explícito", () => {
  assert.deepEqual(netProposal(review()), { raw: 8, packs: 3, quantity: 9 });
  assert.equal(netProposal({ ...review(), opening_stock: 20 })?.quantity, 0);
  assert.equal(netProposal({ ...review(), incoming: null } as unknown as ReviewInput), null);
  assert.equal(netProposal({ ...review(), pack: 0 }), null);
  assert.equal(netProposal({ ...review(), pack: Infinity }), null);
  assert.equal(netProposal({ ...review(), stock_note: "" }), null);
});
test("consolidado bloqueia subtotal incompleto e não herda conferência de sexta na segunda", () => {
  const rows = operationalRows(snapshot()); const saved: WeekReview = { ...review(), id: "review", created_at: "2026-10-23T12:00:00Z" };
  assert.equal(consolidateProposals(rows, [saved])[0]!.quantity, 9);
  const other = { ...rows[0]!, key: "other:i1:KG", unit_id: "other", snapshot_id: "other" };
  assert.equal(consolidateProposals([...rows, other], [saved])[0]!.quantity, null);
  const monday = rows.map(r => ({ ...r, snapshot_id: "monday" })); assert.equal(consolidateProposals(monday, [saved])[0]!.quantity, null);
});
test("IDs iguais com unidades diferentes ou desconhecidas não são fundidos", () => {
  const rows = operationalRows(snapshot()); const other = { ...rows[0]!, key: "other", measure: "UN" };
  assert.equal(consolidateProposals([...rows, other], []).length, 2);
  const unknown = rows.map(r => ({ ...r, measure: null }));
  assert.equal(consolidateProposals([...unknown, { ...unknown[0]!, unit_id: "other" }], []).length, 2);
});
test("produtos sem ficha permanecem fora do consumo, sem sumir da cobertura", () => {
  const s = snapshot(); s.planning.products[0]!.confirmed = false;
  assert.equal(mappedProducts(s.planning).length, 0); assert.equal(operationalRows(s).length, 0);
});
test("cadastro de transferência bloqueia consolidado de compra, mesmo com proposta anterior", () => {
  const s = snapshot(); s.current_policies = [{ insumo_id: "i1", origem_reposicao: "transferencia", qtd_minima: 2, qtd_maxima: null }];
  const rows = operationalRows(s);
  assert.equal(rows[0]!.replenishment, "transferencia");
  assert.equal(consolidateProposals(rows, [{ ...review(), id: "review", created_at: "2026-10-23" }])[0]!.quantity, null);
});
