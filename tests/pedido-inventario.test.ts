import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estoqueParaPedido } from '../src/lib/compras/pedido-inventario';
const item = {
  estoque_contado: null as number | null,
  contado_em: null as string | null,
  unidade_medida: 'KG',
  inventario: { quantidade: 12 as number | null, posicao_de: '2026-11-01', posicao_ate: '2026-11-02', unidade_medida: 'KG' },
};
test('uses inventory and preserves real zero', () => {
  assert.equal(estoqueParaPedido(item), 12);
  assert.equal(estoqueParaPedido({ ...item, inventario: { ...item.inventario, quantidade: 0 } }), 0);
});
test('new manual count takes priority; old count does not', () => {
  assert.equal(estoqueParaPedido({ ...item, estoque_contado: 8, contado_em: '2026-11-03T12:00:00Z' }), 8);
  assert.equal(estoqueParaPedido({ ...item, estoque_contado: 8, contado_em: '2026-11-01T12:00:00Z' }), 12);
  assert.equal(estoqueParaPedido(item, 0), 0);
});
test('missing, negative and incompatible inventory cannot become available stock', () => {
  assert.equal(estoqueParaPedido({ ...item, inventario: null }), null);
  assert.equal(estoqueParaPedido({ ...item, inventario: { ...item.inventario, quantidade: null } }), null);
  assert.equal(estoqueParaPedido({ ...item, inventario: { ...item.inventario, quantidade: -2 } }), null);
  assert.equal(estoqueParaPedido({ ...item, unidade_medida: 'UN' }), null);
});
