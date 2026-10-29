import {test} from 'node:test';
import assert from 'node:assert/strict';
import {potentialProduction,purchaseSummary,replenishmentDates,orderState,orderProgress,type AtlasStock,type AtlasPurchase,type AtlasOrder} from '../src/lib/atlas/model';
const stock=(id:string,quantity:number):AtlasStock=>({itemId:id,name:id,code:id,unit:'KG',category:'Proteínas',group:'MPA',quantity,usable:true,reason:null,historicalPrice:null,priceDate:null});
const component=(id:string,quantity:number)=>({id,name:id,quantity,utilization:100});
test('capacidade agrega componentes repetidos e respeita o menor saldo',()=>{
 const result=potentialProduction(2,[component('carne',3),component('carne',2),component('sal',1)],[stock('carne',20),stock('sal',3)],true);
 assert.equal(result.possible,6);assert.equal(result.limiting,'sal');assert.equal(result.components[0]?.quantity,5);
});
test('capacidade não usa saldo ausente ou vencido, nem rendimento/aproveitamento indefinido',()=>{
 const cs=[component('carne',2)];
 assert.equal(potentialProduction(2,cs,[],true).possible,null);
 assert.equal(potentialProduction(2,cs,[{...stock('carne',20),usable:false,reason:'Posição desatualizada'}],true).possible,null);
 assert.equal(potentialProduction(0,cs,[stock('carne',20)],true).possible,null);
 assert.equal(potentialProduction(2,[{...cs[0]!,utilization:80}],[stock('carne',20)],true).possible,null);
 assert.equal(potentialProduction(2,cs,[stock('carne',20)],false).possible,null);
 assert.equal(potentialProduction(2,cs,[stock('carne',0)],true).possible,0);
});
test('totais de compras deduplicam a identidade e acumulam centavos por mês',()=>{
 const a:AtlasPurchase={id:'1',unitId:'u',date:'2026-01-01',month:'2026-01',invoice:'1',itemId:'i',item:'Carne',category:'Proteínas',supplierId:'s',supplier:'Fornecedor',value:.1};
 const result=purchaseSummary([a,a,{...a,id:'2',value:.2},{...a,id:'3',value:10,month:'2026-02'}]);
 assert.equal(result.total,10.3);assert.equal(result.suppliers[0]?.months['2026-01'],.3);assert.equal(result.categories[0]?.value,10.3);
});
const forecast={stock:10,safety:5,leadDays:2,demand:[0,1,2,3].map(i=>({date:`2026-10-${29+i}`,quantity:2,samples:5})),incoming:[],exceptions:[]};
// Valid consecutive dates spanning a month boundary.
forecast.demand=['2026-10-29','2026-10-30','2026-10-31','2026-11-01'].map(date=>({date,quantity:2,samples:5}));
test('pedir antes de cruzar a reserva mínima, mesmo sem ruptura no horizonte',()=>{
 const r=replenishmentDates(forecast);assert.equal(r.orderBy,'2026-10-29');assert.equal(r.shortage,null);assert.equal(r.forecastOk,true);assert.equal(r.horizonEnd,'2026-11-01');
});
test('entrega confirmada adia a reposição; saldo insuficiente pode indicar prazo já passado',()=>{
 assert.equal(replenishmentDates({...forecast,incoming:[{date:'2026-10-30',quantity:5,confirmed:true}]}).orderBy,null);
 const r=replenishmentDates({...forecast,stock:1});assert.equal(r.orderBy,'2026-10-27');assert.equal(r.shortage,'2026-10-29');
});
test('dados inválidos nunca produzem uma promessa de reposição',()=>{
 for(const change of [{stock:null},{leadDays:null},{safety:null},{exceptions:['sincronizacao_consumo_antiga']},{incoming:[{date:'2026-10-30',quantity:5,confirmed:false}]},{demand:[forecast.demand[0]!,forecast.demand[2]!]},{demand:forecast.demand.map(d=>({...d,samples:3}))}]){
  const r=replenishmentDates({...forecast,...change});assert.equal(r.forecastOk,false);assert.equal(r.orderBy,null);
 }
});
test('embalagem pendente não altera a data física de reposição e base indica produção',()=>{
 assert.equal(replenishmentDates({...forecast,exceptions:['embalagem_ou_minimo_pendente','repor_por_producao']}).orderBy,'2026-10-29');
});
const order:AtlasOrder={id:'o',unitId:'u',number:'PO-1',status:'enviado',date:'2026-10-28',eta:null,supplierId:null,supplier:null,value:null,lines:[]};
test('caminhão não avança por passagem de tempo sem fornecedor e previsão',()=>{
 assert.equal(orderState(order,'2026-10-29'),'dados pendentes');assert.equal(orderProgress(order,'2026-10-29'),0);
 assert.equal(orderState({...order,supplierId:'s',eta:'2026-10-28'},'2026-10-29'),'atrasado');
 assert.equal(orderProgress({...order,status:'recebido'},'2026-10-29'),1);
});
