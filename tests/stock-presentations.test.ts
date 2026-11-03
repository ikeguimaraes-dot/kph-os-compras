/* eslint-disable @typescript-eslint/no-explicit-any -- Runtime harness executes server actions in a VM with mocked database builders. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { getStockStatus } from '../src/lib/compras/stock-status';
const require = createRequire(import.meta.url);
const unit = '674eac8c-5a38-4a42-aa60-0a666387909b';
const id = '47b0d097-69d7-4afb-b9ef-430c443178e9';
const date = '2026-11-03T00:34:59.743175+00:00';
function load(file: string, access: (...args: unknown[]) => unknown) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandboxModule = { exports: {} as Record<string, (...args: any[]) => Promise<any>> };
  vm.runInNewContext(output, { module: sandboxModule, exports: sandboxModule.exports, require: (name: string) => name === './everest-access' ? { comprasAccess: access } : require(name), Date, Map, Set });
  return sandboxModule.exports;
}
function database(data: unknown) {
  const calls: [string, ...unknown[]][] = [];
  const builder: Record<string, any> = {};
  for (const method of ['select','eq','order','range','update','limit','upsert']) builder[method] = (...args: unknown[]) => { calls.push([method, ...args]); return builder; };
  builder.then = (resolve: (value: unknown) => void) => resolve({ data, error: null });
  builder.maybeSingle = async () => ({ data, error: null });
  return { calls, db: { from: (table: string) => { calls.push(['from', table]); return builder; } } };
}
test('unknown is distinct from physically counted zero; blocked wins every stock state', () => {
  assert.equal(getStockStatus(null, 10, null).label, 'A contar');
  assert.equal(getStockStatus(0, 10, null).label, 'Zerado');
  assert.equal(getStockStatus(5, 10, null).label, 'Abaixo do mínimo');
  assert.equal(getStockStatus(10, 10, null).label, 'OK');
  for (const stock of [null, 0, 5, 100]) assert.equal(getStockStatus(stock, 10, 20, 'bloqueado').label, 'Bloqueado');
});
test('presentation reads authorize before scoped database access', async () => {
  const {db, calls} = database([]); const scopes: unknown[][] = [];
  const a = load('src/lib/compras/estoque-apresentacoes-actions.ts', async (...args) => { scopes.push(args); return {db}; });
  assert.equal((await a.getEstoqueApresentacoes!(unit)).length, 0);
  assert.equal(scopes[0]![0], unit);
  assert.ok(calls.some(c => c[0] === 'eq' && c[1] === 'unit_id' && c[2] === unit));
});
test('denied access never queries database', async () => {
  const a = load('src/lib/compras/estoque-apresentacoes-actions.ts', async () => { throw new Error('Casa não autorizada'); });
  await assert.rejects(a.getEstoqueApresentacoes!(unit), /Casa não autorizada/);
});
test('count zero is persisted with unit, id and optimistic version; does not rewrite stock or minimum', async () => {
  const {db, calls} = database({id}); const scopes: unknown[][] = [];
  const a = load('src/lib/compras/estoque-apresentacoes-actions.ts', async (...args) => { scopes.push(args); return {db, user: {id}}; });
  await a.contarEstoqueApresentacao!({unitId: unit, id, saldo: 0, expectedUpdatedAt: date});
  assert.equal(scopes[0]![1], 'write');
  for (const [key, value] of [['unit_id',unit],['id',id],['atualizado_em',date]]) assert.ok(calls.some(c => c[0] === 'eq' && c[1] === key && c[2] === value));
  const update = calls.find(c => c[0] === 'update')![1] as Record<string, unknown>;
  assert.equal(update.saldo_unidades, 0);
  assert.ok(update.contado_em);
  assert.equal('minimo_unidades' in update, false);
  assert.equal('quantidade' in update, false);
});
test('stale count cannot silently overwrite a newer count', async () => {
  const {db} = database(null);
  const a = load('src/lib/compras/estoque-apresentacoes-actions.ts', async () => ({db, user: {id}}));
  await assert.rejects(a.contarEstoqueApresentacao!({unitId: unit,id,saldo: 2,expectedUpdatedAt: date}), /Recarregue/);
});
test('invalid counts are rejected before authorization or writes', async () => {
  let touched = false;
  const a = load('src/lib/compras/estoque-apresentacoes-actions.ts', async () => { touched = true; });
  for (const saldo of [-1, NaN, Infinity]) await assert.rejects(a.contarEstoqueApresentacao!({unitId: unit,id,saldo,expectedUpdatedAt: date}));
  assert.equal(touched, false);
});
test('aggregate policy with presentations cannot be edited through server action', async () => {
  const {db, calls} = database([{id}]);
  const a = load('src/lib/compras/estoque-minmax-actions.ts', async () => ({db,user:{id}}));
  await assert.rejects(a.upsertEstoqueMinMax!({unit_id:unit,insumo_id:id,qtd_minima:10,qtd_maxima:null,origem_reposicao:'compra'}), /permanece bloqueado/);
  assert.equal(calls.some(c => c[0] === 'upsert'), false);
});

test('replenishment excludes presentation aggregates even when legacy policy says purchase', async () => {
  const db = { from: (table: string) => {
    const data = table === 'compras_estoque_minimo' ? [{insumo_id:id,qtd_minima:10,origem_reposicao:'compra',fornecedor_preferencial_id:null}]
      : table === 'compras_estoque_apresentacoes' ? [{insumo_id:id}] : [];
    const b: Record<string, any> = {};
    for (const name of ['select','eq','gt','neq','range','not','in','order']) b[name] = () => b;
    b.then = (resolve: (r: unknown) => void) => resolve({data,error:null});
    return b;
  }};
  const a = load('src/lib/compras/pedidos-sugestoes-actions.ts', async () => ({db}));
  const result = await a.getSugestoesReposicao!(unit);
  assert.equal(result.comprar.length, 0);
  assert.equal(result.transferir_produzir.length, 0);
});
test('policy-only item remains visible and mixed stock never becomes presentation stock', async () => {
  const db = { from: (table: string) => {
    const data = table === 'compras_estoque_minimo' ? [{insumo_id:id,qtd_minima:10,origem_reposicao:'compra',fornecedor_preferencial_id:null}]
      : table === 'compras_estoque_apresentacoes' ? [{insumo_id:id}]
      : table === 'everest_itens' ? [{id,descricao:'Mixed item',unidade_medida:'L'}]
      : table === 'v_pedido_estoque' ? [{item_id:id,quantidade:999}]
      : table === 'compras_contagem_rapida' ? [{insumo_id:id,qtd:999,contado_em:date}]
      : table === 'mv_consumo_tendencia' ? [{insumo_id:id,tendencia_sem:20}] : [];
    const b: Record<string, any> = {};
    for (const name of ['select','eq','range','not','in','order']) b[name] = () => b;
    b.then = (resolve: (r: unknown) => void) => resolve({data,error:null});
    return b;
  }};
  const a = load('src/lib/compras/estoque-minmax-actions.ts', async () => ({db}));
  const rows = await a.getEstoqueMinMaxItems!(unit);
  assert.equal(rows.length,1);
  assert.equal(rows[0].compra_12m,0);
  assert.equal(rows[0].tem_apresentacoes,true);
  assert.equal(rows[0].estoque_atual,null);
  assert.equal(rows[0].qtd_contada,null);
  assert.equal(rows[0].qtd_minima,null);
  assert.equal(rows[0].qtd_maxima,null);
  assert.equal(rows[0].tendencia_sem,null);
  assert.equal(rows[0].origem_reposicao,'bloqueado');
});
test('unit migration accepts pieces, preserves weight and volume, and rejects unknown units', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec("create table compras_estoque_apresentacoes (unidade_base text constraint compras_estoque_apresentacoes_unidade_base_check check (unidade_base in ('KG','L'))); insert into compras_estoque_apresentacoes values ('KG'),('L');");
    await db.exec(fs.readFileSync('supabase/migrations/20261103034324_estoque_apresentacoes_unidades.sql','utf8'));
    await db.exec("insert into compras_estoque_apresentacoes values ('UNID');");
    const r = await db.query('select unidade_base from compras_estoque_apresentacoes order by unidade_base');
    assert.deepEqual(r.rows, [{unidade_base:'KG'},{unidade_base:'L'},{unidade_base:'UNID'}]);
    await assert.rejects(db.exec("insert into compras_estoque_apresentacoes values ('UNKNOWN');"));
  } finally { await db.close(); }
});
