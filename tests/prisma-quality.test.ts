import {test} from 'node:test';
import assert from 'node:assert/strict';
import {monthly,type MonthRow} from '../src/lib/compras/prisma-cockpit';
const row:MonthRow={unit_id:'house',mes:'2026-09-01',comprado_rs:200,receita:1000,receita_confirmada:1000,receita_coberta:1000,custo_teorico_rs:250,cmv_real_rs:200,metodo:'proxy',cmv_meta_pct:null,economia_meta_rs:null};
test('revenue partial suppresses CMV and extrapolated gap even when purchase proxy looks favorable',()=>{
 const result=monthly([{...row,receita_parcial:true}]);
 assert.equal(result.real,null);assert.equal(result.gap,null);assert.equal(result.gapRs,null);
});
test('incomplete notes stay labelled and do not disappear when aggregated with another house',()=>{
 const result=monthly([{...row,notas_incompletas:true},{...row,unit_id:'other',notas_incompletas:false}]);
 assert.equal(result.incomplete,true);
});
test('unknown history is not treated as validated completeness',()=>assert.equal(monthly([{...row,notas_incompletas:null}]).unverified,true));
