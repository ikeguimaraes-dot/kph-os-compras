import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFlow,filterMap,creditColor,titleTimeline,mapView,edgeAmount,type MapEdge,type MapBlock,type MapTitle} from '../src/lib/compras/prisma-mapa';
const edge=(v:Partial<MapEdge>={}):MapEdge=>({unit_id:'house-a',raiz_cnpj:'11111111',insumo_id:'item-a',produto_venda_ficha_id:'dish-a',prato:'Prato A',receita_12m:1000,receita_semana:20,peso_custo:.4,share_fornecedor:.5,receita_atribuida:200,critico:true,insumo:'Ingrediente A',categoria:'Proteínas',reserva:0,ultima_compra:'2026-09-20',principal_90d:'11111111',principal_12m:'22222222',fornecedor_trocou:true,...v});
const block:MapBlock={id:'block-a',unit_id:'house-a',prato_id:'dish-a',inicio:'2026-10-01',causa:null,confirmado:false,status:'aberto',nome:'Prato A'};
test('espessura conserva receita por casa, inclusive top 12 e outros',()=>{
 const rows=Array.from({length:20},(_,i)=>edge({produto_venda_ficha_id:`dish-${i}`,receita_atribuida:i+1,raiz_cnpj:i%2?'11111111':'22222222'}));
 const f=buildFlow(rows,[],'12m');assert.equal(f.total,210);assert.equal(f.targets.length,13);
 assert.equal(f.links.reduce((s,l)=>s+l.value,0),210);assert.equal(f.targets.reduce((s,l)=>s+l.value,0),210);
 assert.equal(buildFlow(filterMap([...rows,edge({unit_id:'house-b'})],[],{unit:'house-a',period:'12m',category:'',only86:false,noReserve:false}),[],'12m').total,210);
});
test('dois fornecedores repartem custo e share, sem repetir receita cheia',()=>{
 const rows=[edge(),edge({raiz_cnpj:'22222222'}),edge({insumo_id:'item-b',peso_custo:.6,share_fornecedor:1,receita_atribuida:600})];
 const f=buildFlow(rows,[],'12m');assert.equal(f.total,1000);assert.deepEqual(f.sources.map(s=>s.value),[800,200]);
 assert.equal(edgeAmount(rows[0]!,'semana'),4);
});
test('86 tem precedência sobre sem reserva, filtro nunca retorna faixa não vermelha',()=>{
 const rows=[edge(),edge({unit_id:'house-b'}),edge({produto_venda_ficha_id:'dish-b'})];
 const filtered=filterMap(rows,[block],{unit:'',period:'12m',category:'',only86:true,noReserve:false});
 assert.equal(filtered.length,1);assert.ok(buildFlow(filtered,[block],'12m').links.every(l=>l.color==='red'));
});
test('Outros pratos mantém cores separadas sem contaminar pratos em 86',()=>{
 const rows=Array.from({length:15},(_,i)=>edge({produto_venda_ficha_id:`dish-${i}`,receita_atribuida:100-i,reserva:i===13?0:2}));
 const f=buildFlow(rows,[{...block,prato_id:'dish-14'}],'12m');
 assert.deepEqual(f.links.filter(l=>l.target==='outros').map(l=>l.color).sort(),['amber','green','red']);
});
test('crédito contempla nulo, zero, 80% e limite estourado',()=>{
 assert.equal(creditColor(100,null),'neutral');assert.equal(creditColor(0,0),'green');assert.equal(creditColor(1,0),'red');
 assert.equal(creditColor(80,100),'green');assert.equal(creditColor(81,100),'amber');assert.equal(creditColor(101,100),'red');
});
test('linha do tempo reconcilia duplicatas, a conciliar, fora do eixo e sem vencimento',()=>{
 const t=(id:string,days:number|null,value:number,acordo=false):MapTitle=>({id,unit_id:'a',raiz_cnpj:'11111111',dt_vencimento:days===null?null:`2026-09-${Math.abs(days)%28+1}`,dias_atraso:days,vl_saldo:value,acordo,ds_parcela:null});
 const first=t('1',40,100,true),r=titleTimeline([first,first,t('2',121,20),t('3',110,30),t('4',-46,40),t('5',null,50)]);
 assert.equal(r.total,240);assert.equal(r.conciliar,20);assert.equal(r.outside,70);assert.equal(r.unknown,50);assert.equal(r.days.length,1);assert.ok(r.days[0]?.agreement);
});
test('visão da URL aceita apenas as três posições',()=>{
 assert.equal(mapView('dependencia'),'dependencia');assert.equal(mapView('travados'),'travados');assert.equal(mapView('invalid'),'dinheiro');assert.equal(mapView(undefined),'dinheiro');
});
