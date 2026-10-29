import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildOperationalPendings,pendingGroups} from '../src/lib/pendencias/model';
import type {AtlasOperations,AtlasReplenishment,AtlasOrder} from '../src/lib/atlas/model';
const base:AtlasOperations={readAt:'2026-10-29T05:00:00Z',year:2026,start:'2026-01-01',end:'2026-10-29',units:[{id:'a',name:'Casa A'},{id:'b',name:'Casa B'}],purchases:[],orders:[],depots:[],capacity:[],replenishment:[],warnings:[]};
const item:AtlasReplenishment={unitId:'a',itemId:'i',name:'Item',unit:'KG',group:'MP',category:'Proteínas',stock:0,at:'2026-10-29T04:00:00Z',minimum:1,demand:4,shortage:null,orderBy:null,forecastOk:true,horizonEnd:'2026-11-01',quantity:4,state:'86',issues:[]};
const order:AtlasOrder={id:'p',unitId:'a',number:'PO-1',status:'enviado',date:'2026-10-28',eta:null,supplierId:null,supplier:null,value:1,lines:[{id:'l',name:'Item',unit:'KG',quantity:1,received:0,itemId:null}]};
test('85/86 e encaminhamento para produção não são erros de informação',()=>{
 assert.equal(buildOperationalPendings({...base,replenishment:[item,{...item,itemId:'b',state:'85',issues:['repor_por_producao']}]}).rows.length,0);
});
test('identidade da ocorrência preserva casa e causa e elimina repetições',()=>{
 const data=buildOperationalPendings({...base,replenishment:[{...item,issues:['prazo_pendente','prazo_pendente']},{...item,unitId:'b',issues:['prazo_pendente']},{...item,unitId:'fora',issues:['prazo_pendente']}]});
 assert.equal(data.rows.length,2);assert.notEqual(data.rows[0]?.id,data.rows[1]?.id);assert.equal(pendingGroups(data.rows)[0]?.entities,2);
});
test('correção na origem remove a ocorrência da leitura sem gravar ou apagar histórico',()=>{
 const before=buildOperationalPendings({...base,replenishment:[{...item,issues:['prazo_pendente']}]});
 const after=buildOperationalPendings({...base,replenishment:[item]});
 assert.equal(before.rows.length,1);assert.equal(after.rows.length,0);
});
test('pedidos abertos têm causas distintas; rascunhos e recebidos não viram entrega pendente',()=>{
 const data=buildOperationalPendings({...base,orders:[order,{...order,id:'r',status:'rascunho'},{...order,id:'f',status:'recebido'}]});
 assert.equal(data.rows.length,3);assert.deepEqual(new Set(data.rows.map(r=>r.code)),new Set(['fornecedor','previsao','identidade']));
 assert.equal(buildOperationalPendings({...base,orders:[{...order,eta:'2026-10-30',supplierId:'s',lines:[]}]}).rows.length,0);
});
test('saldo vencido gera uma causa por depósito e zero não vira erro',()=>{
 const stocks=Array.from({length:100},(_,i)=>({itemId:String(i),name:'Item',code:String(i),unit:'KG',category:'Proteínas',group:'MP',quantity:0,usable:false,reason:'Posição desatualizada',historicalPrice:null,priceDate:null}));
 const depot={id:'d',unitId:'a',company:1,code:1,name:'Central',at:'2026-10-27T00:00:00Z',complete:true,stocks};
 assert.equal(buildOperationalPendings({...base,depots:[depot]}).rows.length,1);
 assert.equal(buildOperationalPendings({...base,depots:[{...depot,at:'2026-10-29T04:00:00Z',stocks:stocks.map(s=>({...s,usable:true,reason:null}))}]}).rows.length,0);
});
test('saldos sem código não desaparecem da fila',()=>{
 const result=buildOperationalPendings({...base,depots:[{id:'d',unitId:'a',company:1,code:1,name:'Central',at:base.readAt,complete:true,stocks:[],unidentified:3}]});
 assert.equal(result.rows[0]?.code,'saldo_sem_identidade');assert.match(result.rows[0]?.impact??'',/3 registros/);
});
test('compras associadas deduplicam linhas e não se somam por ocorrência',()=>{
 const purchase={id:'l',unitId:'a',date:'2026-10-01',month:'2026-10',invoice:'1',itemId:'i',item:'Item',category:'Proteínas',supplierId:'s',supplier:'S',value:10.25};
 const data=buildOperationalPendings({...base,purchases:[purchase,purchase],replenishment:[{...item,issues:['prazo_pendente','seguranca_pendente']}]});
 assert.equal(data.rows.length,2);assert.ok(data.rows.every(r=>r.purchaseValue===10.25));
 const g=pendingGroups([...data.rows,data.rows[0]!]);assert.equal(g.find(r=>r.code==='prazo_pendente')?.purchaseValue,10.25);
});
test('falha de fonte mantém aviso de cobertura incompleta mesmo sem itens',()=>{
 const d=buildOperationalPendings({...base,warnings:['Projeção de reposição indisponível.']});assert.equal(d.rows.length,1);assert.equal(d.rows[0]?.source,'fontes');assert.equal(d.rows[0]?.severity,'bloqueio');
});
test('confirmação vencida não altera 86 nem inventa vínculo de produto',()=>{
 const d=buildOperationalPendings({...base,positions:[{unit_id:'a',ultima_confirmacao:'2026-10-26T14:00:00Z',status:'desatualizado',itens:[{item_id:'evento',nome:'Nome',identidade:'base',pendencia:null,afetados:[{produto_id:'produto',ficha_id:null,vinculo_ficha_pendente:true}]}]}]});
 assert.equal(d.rows.filter(r=>r.unitId==='a').length,2);assert.ok(d.rows.every(r=>r.itemId===null));
});
test('cadastro de ficha fora da cadeia de proteínas também aparece',()=>{
 const d=buildOperationalPendings({...base,recipeChecks:[{unitId:'a',id:'f',itemId:'x',name:'Base de massa',issues:['Quantidade de componente ausente ou inválida']}]});assert.equal(d.rows.length,1);assert.equal(d.rows[0]?.code,'cadastro_ficha');
});
