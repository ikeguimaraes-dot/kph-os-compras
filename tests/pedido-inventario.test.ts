import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estoqueParaPedido, posicaoDoItem, DEPOSITO_OPERACAO, type DepositoSaldo } from '../src/lib/compras/pedido-inventario';
const now = Date.parse('2026-11-04T14:00:00Z');
const catalog = { cd_item: '100', everest_codigo: 12, unidade_medida: 'KG' };
const record = { cd_item: '100', id_item: 12, cd_empresa: 1, cd_deposito: 2, qt_estoque: 10, sg_unidademedida: 'KG' };
const depot: DepositoSaldo = { unit_id: 'meet', empresa: 1, deposito: 2, nome: 'MEET', total: 1, concluido_em: '2026-11-04T13:00:00Z', registros: [record] };
const item = { estoque_contado: null as number | null, contado_em: null as string | null, unidade_medida: 'KG', inventario: { operacao: posicaoDoItem(depot, catalog, now), centrais: [] } };
test('uses operation only; central is never subtracted or added', () => {
  assert.equal(estoqueParaPedido(item), 10);
  assert.equal(estoqueParaPedido({ ...item, inventario: { ...item.inventario, centrais: [{ ...item.inventario.operacao, quantidade: 100 }] } }), 10);
  assert.deepEqual(DEPOSITO_OPERACAO, { 1: 2, 3: 3, 5: 6, 10: 5 });
});
test('real zero differs from missing item; matches both catalog codes', () => {
  assert.equal(posicaoDoItem({ ...depot, registros: [{ ...record, qt_estoque: 0 }] }, catalog, now).quantidade, 0);
  assert.equal(posicaoDoItem(depot, { ...catalog, everest_codigo: 99 }, now).motivo, 'Item sem leitura');
});
test('rejects incomplete, wrong scope, duplicates, stale, negative and incompatible stock', () => {
  const variants = [
    { ...depot, total: 2 },
    { ...depot, registros: [{ ...record, cd_empresa: 5 }] },
    { ...depot, total: 2, registros: [record, record] },
    { ...depot, concluido_em: '2026-11-03T13:00:00Z' },
    { ...depot, registros: [{ ...record, qt_estoque: -2 }] },
    { ...depot, registros: [{ ...record, sg_unidademedida: 'UNID' }] },
    { ...depot, registros: [{ ...record, qt_estoque: null }] },
  ];
  for (const variant of variants) {
    const position = posicaoDoItem(variant, catalog, now);
    assert.ok(position.motivo);
    assert.equal(estoqueParaPedido({ ...item, inventario: { operacao: position, centrais: [] } }), null);
  }
});
test('manual timestamps compare hours, including counts on same day', () => {
  assert.equal(estoqueParaPedido({ ...item, estoque_contado: 4, contado_em: '2026-11-04T12:00:00Z' }), 10);
  assert.equal(estoqueParaPedido({ ...item, estoque_contado: 4, contado_em: '2026-11-04T13:30:00Z' }), 4);
  assert.equal(estoqueParaPedido(item, 0), 0);
  assert.equal(estoqueParaPedido(item, -1), null);
});
