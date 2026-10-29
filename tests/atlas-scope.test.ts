import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scopeAtlas} from '../src/components/digital-twin/scope';
import type {TwinData,TwinHouse} from '../src/components/digital-twin/model';
const house=(id:string):TwinHouse=>({id,name:id,items:[],itemCount:1,stockCount:0,snapshotAt:'2026-10-28',coverage:{dias_conciliados:1,dias_vendas:1,dias_eventos:1}});
const data:TwinData={capturedAt:'2026-10-28',source:'test',houses:[house('allowed'),house('secret')],activity:{capturedAt:'2026-10-28',from:'2026-10-01',to:'2026-10-28',source:'test',rows:[{unit_id:'allowed',dow:1,samples:4,mean_clients:5},{unit_id:'secret',dow:1,samples:4,mean_clients:999}]},network:{capturedAt:'2026-10-28',period:{from:'2026-10-01',to:'2026-10-28',days:28},commonDays:1,commonDates:['2026-10-01'],comparison:[{id:'allowed',days:1,revenue:100,itemssold:10},{id:'secret',days:1,revenue:999,itemssold:999}],suppliers:[{id:'shared',name:'Shared',label:'Shared',kg:1000,spend:1000,invoices:100,volumes:[{unit:'L',quantity:888}],houses:[{unit_id:'allowed',kg:10,spend:100,invoices:2},{unit_id:'secret',kg:990,spend:900,invoices:98}]},{id:'private-supplier',name:'Private',label:'Private',kg:9,spend:9,invoices:1,volumes:[],houses:[{unit_id:'secret',kg:9,spend:9,invoices:1}]}]}};
test('escopo remove casas, vendas, atividade e fornecedores não autorizados',()=>{
 const scoped=scopeAtlas(data,['allowed']);
 assert.equal(scoped.houses.length,1);
 assert.equal(scoped.network!.comparison.length,1);
 assert.equal(scoped.activity!.rows.length,1);
 assert.equal(scoped.network!.suppliers.length,1);
 assert.equal(JSON.stringify(scoped).includes('secret'),false);
 assert.equal(JSON.stringify(scoped).includes('private-supplier'),false);
 assert.equal(scoped.network!.suppliers[0]!.spend,100);
 assert.equal(scoped.network!.suppliers[0]!.kg,10);
 assert.equal(scoped.network!.suppliers[0]!.invoices,2);
 assert.deepEqual(scoped.network!.suppliers[0]!.volumes,[{unit:'KG',quantity:10}]);
 assert.equal(data.network!.suppliers[0]!.spend,1000);
});
test('escopo vazio nunca significa grupo inteiro',()=>{
 const scoped=scopeAtlas(data,[]);
 assert.deepEqual(scoped.houses,[]);
 assert.deepEqual(scoped.activity!.rows,[]);
 assert.deepEqual(scoped.network!.comparison,[]);
 assert.deepEqual(scoped.network!.suppliers,[]);
});
test('acesso integral preserva os volumes documentados de unidades diferentes',()=>{
 const scoped=scopeAtlas(data,['allowed','secret']);
 assert.deepEqual(scoped.network,data.network);
});
