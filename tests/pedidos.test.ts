import test from "node:test";
import assert from "node:assert/strict";
import { creditState, orderTotal, suggestQuantity, type PedidoItem } from "../src/lib/compras/pedidos";
import { purchaseOrderCreateSchema } from "../src/lib/compras/schema";
const item: PedidoItem = { id: "item", descricao: "Insumo", unidade_medida: "KG", desbloqueia: [],
  stock: { item_id: "item", quantidade: 3, unidade_medida: "KG", posicao_de: "2026-10-01", posicao_ate: "2026-10-01", fonte: "Everest", posicoes: [] },
  consumption: [1, 2, 3, 4, 5, 6, 7].map((dow) => ({ insumo_id: "item", dow, consumo_medio: dow, dias_observados: 12, pratos: [] })) };
test("cobertura segue os dias cobertos, cruza domingo e arredonda a embalagem", () => {
  // Sexta + sábado + domingo + segunda = 5+6+7+1=19; estoque 3; caixa 6 -> 3 caixas.
  const result = suggestQuantity(item, "2026-10-09", 4, 6);
  assert.equal(result.quantity, 3);
  assert.match(result.formula, /19/);
});
test("estoque alto sugere zero, nunca pedido negativo", () => {
  assert.equal(suggestQuantity({ ...item, stock: { ...item.stock!, quantidade: 100 } }, "2026-10-09", 7, 1).quantity, 0);
});
test("ausência de ficha, estoque ou dias não vira consumo zero", () => {
  assert.equal(suggestQuantity({ ...item, consumption: [] }, "2026-10-09", 7, 1).quantity, null);
  assert.equal(suggestQuantity({ ...item, stock: null }, "2026-10-09", 7, 1).quantity, null);
  assert.equal(suggestQuantity({ ...item, consumption: item.consumption.map((c) => ({ ...c, consumo_medio: null })) }, "2026-10-09", 7, 1).quantity, null);
  assert.equal(suggestQuantity({ ...item, stock: { ...item.stock!, unidade_medida: "UN" } }, "2026-10-09", 7, 1).quantity, null);
});
test("crédito desconhecido, limiar estrito de 80%, zero e estouro com pedido", () => {
  assert.equal(creditState(null, 10, 5), "unknown");
  assert.equal(creditState(100, 80), "green");
  assert.equal(creditState(100, 80, 0.01), "amber");
  assert.equal(creditState(100, 80, 20), "amber");
  assert.equal(creditState(100, 80, 20.01), "red");
  assert.equal(creditState(0, 0, 1), "red");
});
test("total usa centavos por linha, compatível com pedido", () => {
  assert.equal(orderTotal([{ quantidade: 3, preco_unitario: 0.1 }, { quantidade: 1, preco_unitario: 1.005 }]), 1.31);
});
test("entrada rejeita valores não finitos, cobertura inválida e excesso sem booleano", () => {
  const value = { unit_id: "674eac8c-5a38-4a42-aa60-0a666387909b", brand_id: "674eac8c-5a38-4a42-aa60-0a666387909b", data_pedido: "2026-10-09", items: [{ nome: "Item", quantidade: 1, preco_unitario: 2 }] };
  assert.equal(purchaseOrderCreateSchema.safeParse(value).success, true);
  assert.equal(purchaseOrderCreateSchema.safeParse({ ...value, cobertura_dias: 0 }).success, false);
  assert.equal(purchaseOrderCreateSchema.safeParse({ ...value, confirmar_excesso: "true" }).success, false);
  assert.equal(purchaseOrderCreateSchema.safeParse({ ...value, items: [{ nome: "Item", quantidade: Infinity, preco_unitario: 2 }] }).success, false);
});
