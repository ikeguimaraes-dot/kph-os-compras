import {test} from 'node:test';
import assert from 'node:assert/strict';
import {consolidateConsumption, type Consumption} from '../src/lib/compras/consumo-consolidado';
const units=[{id:'a',d4:28,d8:56,d12:84},{id:'b',d4:28,d8:56,d12:84}];
const row=(unit_id:string,item=1,unidade='KG'):Consumption=>({unit_id,item,nome:'Same name',unidade,q4:4,q8:8,q12:12,w4:1,w8:1,w12:1,pendencias:0});
test('sum only same id and unit within authorized scope',()=>{
 const r=consolidateConsumption(units,[row('a'),row('b'),row('b',2),row('a',1,'UN'),row('outside')]);
 assert.equal(r.length,3);assert.equal(r[0].w8,2);
});
test('partial house cannot silently disappear',()=>{
 const r=consolidateConsumption([units[0],{...units[1],d8:49}],[row('a')])[0];
 assert.equal(r.w8,null);assert.equal(r.w4,1);
});
test('pending units and duplicate source rows block totals',()=>{
 assert.equal(consolidateConsumption(units,[{...row('a'),pendencias:1}])[0].w8,null);
 assert.equal(consolidateConsumption(units,[row('a'),row('a')])[0].q8,null);
});
