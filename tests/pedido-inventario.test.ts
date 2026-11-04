import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estoqueParaPedido, posicaoDoItem, type DepositoInventario } from '../src/lib/compras/pedido-inventario';
const catalog = { id: 'item-a', unidade_medida: 'KG' };
const line = { item_id: 'item-a', quantidade_convertida: 10, unidade_medida: 'KG' };
const depot: DepositoInventario = { unit_id: 'meet', empresa: 1, empresa_nome: 'Meet & Eat', deposito: 2, nome: 'MEET', inventario: { id: 'latest', nr_inventario: 42, dt_inventario: '2026-09-30', situacao: 'ENCERRADO' }, itens: [line] };
const item = { inventario: { operacao: posicaoDoItem(depot, catalog), centrais: [] } };
test('uses closed inventory regardless of age and keeps its number/date', () => {
  assert.equal(estoqueParaPedido(item), 10);
  assert.equal(item.inventario.operacao.atualizado_em, '2026-09-30');
  assert.equal(item.inventario.operacao.numero, 42);
  assert.equal(item.inventario.operacao.inventario_id, 'latest');
});
test('central does not add to operation or reduce its requirement', () => {
  assert.equal(estoqueParaPedido({ inventario: { ...item.inventario, centrais: [{ ...item.inventario.operacao, quantidade: 100 }] } }), 10);
});
test('item missing from latest inventory stays unknown; real zero remains zero', () => {
  const missing = posicaoDoItem({ ...depot, itens: [] }, catalog);
  assert.equal(missing.motivo, 'Item ausente no último inventário encerrado');
  assert.equal(estoqueParaPedido({ inventario: { operacao: missing, centrais: [] } }), null);
  assert.equal(posicaoDoItem({ ...depot, itens: [{ ...line, quantidade_convertida: 0 }] }, catalog).quantidade, 0);
});
test('open, missing, duplicate, invalid unit, null and negative counts are unusable', () => {
  const variants: DepositoInventario[] = [
    { ...depot, inventario: null },
    { ...depot, inventario: { ...depot.inventario!, situacao: 'ABERTO' } },
    { ...depot, itens: [line, line] },
    { ...depot, itens: [{ ...line, unidade_medida: 'UNID' }] },
    { ...depot, itens: [{ ...line, quantidade_convertida: null }] },
    { ...depot, itens: [{ ...line, quantidade_convertida: -1 }] },
  ];
  for (const variant of variants) {
    const position = posicaoDoItem(variant, catalog);
    assert.ok(position.motivo);
    assert.equal(estoqueParaPedido({ inventario: { operacao: position, centrais: [] } }), null);
  }
});
test('newer ad hoc count cannot override closed inventory', () => {
  const counted = { ...item, estoque_contado: 500, contado_em: '2026-11-04T13:30:00Z' };
  assert.equal(estoqueParaPedido(counted), 10);
  assert.equal(estoqueParaPedido({ inventario: null }), null);
});
