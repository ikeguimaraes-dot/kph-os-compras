import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectedConsumption,stockUsable,type TwinItem} from '../src/components/digital-twin/model';
const item: TwinItem={id:'test',name:'Item',unit:'KG',group:'MPA.',stock:10,stockValid:true,stockAt:'2026-10-28T01:00:00-03:00',means:[{dow:3,samples:4,quantity:2},{dow:4,samples:5,quantity:3}],safety:1,incoming:[],sourceAt:null,qualityBlocked:false,references:[]};
test('projeção usa o dia local e não a data UTC',()=>{
 // 01:00 UTC on Thursday is still Wednesday in São Paulo.
 assert.equal(projectedConsumption(item,'2026-10-29T01:00:00Z',2),5);
});
test('dia ausente ou com pouca amostra impede projeção, sem preencher zero',()=>{
 assert.equal(projectedConsumption(item,'2026-10-28T12:00:00Z',3),null);
 assert.equal(projectedConsumption({...item,means:[{dow:3,samples:3,quantity:2}]},'2026-10-28T12:00:00Z',1),null);
});
test('saldo antigo, negativo e leitura futura não viram estoque utilizável',()=>{
 assert.equal(stockUsable(item,'2026-10-28T07:00:00Z'),true);
 assert.equal(stockUsable(item,'2026-10-28T17:00:00Z'),false);
 assert.equal(stockUsable({...item,stock:-1},'2026-10-28T07:00:00Z'),false);
 assert.equal(stockUsable(item,'2026-10-28T01:00:00Z'),false);
});

import {houseShare,houseScale,type TwinNetwork} from '../src/components/digital-twin/model';
const network:TwinNetwork={capturedAt:'2026-10-28',period:{from:'2026-08-05',to:'2026-10-27',days:84},commonDays:2,commonDates:['2026-10-01','2026-10-02'],comparison:[{id:'a',days:2,revenue:900,itemssold:100},{id:'b',days:2,revenue:100,itemssold:400}],suppliers:[]};
test('área da maquete preserva proporção da receita, sem elevar a proporção ao quadrado',()=>{
 const a=houseScale(network,'a','revenue'),b=houseScale(network,'b','revenue');
 assert.ok(Math.abs(a*a/(b*b)-9)<1e-10);
 assert.equal(houseShare(network,'a','revenue'),.9);
 assert.equal(houseShare(network,'b','revenue'),.1);
});
test('trocar para itens vendidos muda a base e escala igual não inventa receita',()=>{
 assert.equal(houseShare(network,'a','itemssold'),.2);
 assert.equal(houseShare(network,'b','itemssold'),.8);
 assert.equal(houseScale(network,'a','equal'),houseScale(network,'b','equal'));
 assert.equal(houseShare(undefined,'a','revenue'),null);
 assert.equal(houseShare({...network,comparison:[]},'a','revenue'),null);
 assert.equal(houseShare(network,'missing','revenue'),null);
});

import {activityProfile,type TwinActivity} from '../src/components/digital-twin/model';
const activity:TwinActivity={capturedAt:'2026-10-28',from:'2026-08-05',to:'2026-10-27',source:'test',rows:[
 {unit_id:'a',dow:1,samples:7,mean_clients:50},{unit_id:'a',dow:6,samples:11,mean_clients:100},
 {unit_id:'a',dow:7,samples:2,mean_clients:900},{unit_id:'b',dow:6,samples:8,mean_clients:1000},
 {unit_id:'a',dow:2,samples:4,mean_clients:0}
]};
test('atividade compara dias da própria casa e exclui dias de pouca amostra da escala',()=>{
 assert.equal(activityProfile(activity,'a',1).relative,.5);
 assert.equal(activityProfile(activity,'a',1).symbols,10);
 assert.equal(activityProfile(activity,'a',6).symbols,16);
 assert.equal(activityProfile(activity,'b',6).symbols,16);
});
test('pouca amostra e ausência mantêm cena ilustrativa sem inventar clientes',()=>{
 for(const profile of [activityProfile(activity,'a',7),activityProfile(undefined,'a',1),activityProfile(activity,'missing',1)]){
  assert.equal(profile.valid,false);assert.equal(profile.mean,null);assert.equal(profile.symbols,8);
 }
});
test('zero observado é diferente de valor inválido',()=>{
 assert.equal(activityProfile(activity,'a',2).mean,0);
 assert.equal(activityProfile(activity,'a',2).symbols,0);
 for(const mean_clients of [-1,NaN,Infinity]){
  const result=activityProfile({...activity,rows:[{unit_id:'a',dow:1,samples:5,mean_clients}]},'a',1);
  assert.equal(result.valid,false);assert.equal(result.mean,null);
 }
});
