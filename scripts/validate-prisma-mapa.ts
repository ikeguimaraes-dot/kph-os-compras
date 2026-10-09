/** Read-only integration checks. Run with node --env-file=.env.local --import tsx.
 * Expected business values belong in an ignored local JSON file, never in Git.
 */
import { createClient } from '@supabase/supabase-js';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { buildFlow,filterMap,titleTimeline,type MapEdge,type MapSupplier,type MapTitle,type MapBlock } from '../src/lib/compras/prisma-mapa';
async function main(){
const config=JSON.parse(await readFile(process.argv[2]!, 'utf8')) as {unit:string;sharedDish:string;changedDish:string;oldRoot:string;debtRoot:string;expectedDebt:number;timelineRoot:string;expectedJulySeptember:number};
const url=process.env.NEXT_PUBLIC_SUPABASE_URL!, key=process.env.SUPABASE_SERVICE_ROLE_KEY!;
if(!url||!key)throw new Error('Supabase environment missing');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const durations:Record<string,number>={};
async function all<T>(table:string,order:string[]){const start=performance.now(),rows:T[]=[];for(let offset=0;;offset+=1000){let q=db.from(table).select('*');for(const k of order)q=q.order(k);const r=await q.range(offset,offset+999);if(r.error)throw new Error(`${table}: ${r.error.message}`);rows.push(...r.data as T[]);if(r.data.length<1000)break;}durations[table]=Math.round(performance.now()-start);return rows;}
const [edges,suppliers,titles,blocks]=await Promise.all([
 all<MapEdge>('v_mapa_aresta',['unit_id','produto_venda_ficha_id','insumo_id','raiz_cnpj']),
 all<MapSupplier>('v_mapa_fornecedor',['unit_id','raiz_cnpj']),
 all<MapTitle>('v_mapa_titulo',['id']),all<MapBlock>('v_mapa_86',['id']),
]);
const results:Record<string,unknown>={},close=(a:number,b:number)=>Math.abs(a-b)<0.01;
const byHouse=[...new Set(suppliers.map(s=>s.unit_id))].map(unit=>{
 const rows=edges.filter(e=>e.unit_id===unit),flow=buildFlow(rows,blocks,'12m'),view=rows.reduce((s,e)=>s+Number(e.receita_atribuida),0);
 return {unit,view,source:flow.total,links:flow.links.reduce((s,l)=>s+l.value,0),targets:flow.targets.reduce((s,t)=>s+t.value,0),pass:close(flow.total,view)&&close(flow.links.reduce((s,l)=>s+l.value,0),view)&&close(flow.targets.reduce((s,t)=>s+t.value,0),view)};
});results.O1={pass:byHouse.every(r=>r.pass),houses:byHouse};
const dish=edges.filter(e=>e.unit_id===config.unit&&e.prato===config.sharedDish),flow=buildFlow(dish,[],'12m'),revenue=Number(dish[0]?.receita_12m??0);
const unknown=dish.filter(e=>e.receita_atribuida==null),missing=[...new Map(dish.filter(e=>e.fonte_preco==='sem_preco').map(e=>[e.insumo_id,{id:e.insumo_id,name:e.insumo}])).values()];
const dishSuppliers=[...new Set(dish.flatMap(e=>e.raiz_cnpj?[e.raiz_cnpj]:[]))].map(root=>{const rows=dish.filter(e=>e.raiz_cnpj===root);return {root,edges:rows.length,attributed:rows.some(e=>e.receita_atribuida==null)?null:rows.reduce((s,e)=>s+Number(e.receita_atribuida),0)};});
results.O2={pass:dish.length>0&&unknown.length===0&&flow.sources.length>1&&flow.sources.every(s=>s.value<revenue)&&flow.total<=revenue+.01,
 status:unknown.length?'blocked_missing_cost':'evaluated',revenue,attributed:unknown.length?null:flow.total,
 edges:dish.length,ingredients:new Set(dish.map(e=>e.insumo_id)).size,unknownEdges:unknown.length,missingPrices:missing,
 preservationPass:dish.length>0&&missing.every(m=>dish.some(e=>e.insumo_id===m.id&&e.peso_custo===null&&e.receita_atribuida===null)),
 suppliers:dishSuppliers};
const changed=edges.filter(e=>e.unit_id===config.unit&&e.prato===config.changedDish).sort((a,b)=>Number(b.peso_custo)-Number(a.peso_custo))[0];
results.O3={pass:!!changed&&changed.principal_90d!==null&&changed.principal_90d!==config.oldRoot&&changed.fornecedor_trocou,ingredient:changed?.insumo,principal90:changed?.principal_90d,principal12:changed?.principal_12m};
const debt=titles.filter(t=>t.raiz_cnpj===config.debtRoot),overdue=debt.filter(t=>Number(t.dias_atraso)>0).reduce((s,t)=>s+Number(t.vl_saldo),0);
results.O4={pass:new Set(debt.map(t=>t.id)).size===debt.length&&close(overdue,config.expectedDebt),titles:debt.length,distinct:new Set(debt.map(t=>t.id)).size,overdue,expected:config.expectedDebt};
const invoices=titles.filter(t=>t.raiz_cnpj===config.timelineRoot),timeline=titleTimeline(invoices),julSep=invoices.filter(t=>t.dt_vencimento&&t.dt_vencimento>='2026-07-01'&&t.dt_vencimento<='2026-09-30');
results.O5={pass:julSep.length===config.expectedJulySeptember&&close(timeline.total,invoices.reduce((s,t)=>s+Number(t.vl_saldo),0)),julySeptember:julSep.length,all:invoices.length,total:timeline.total,days:timeline.days.length,conciliar:timeline.conciliar,outside:timeline.outside,ui:'pending'};
const filtered=filterMap(edges,blocks,{unit:'',period:'12m',category:'',only86:true,noReserve:false}),red=buildFlow(filtered,blocks,'12m');
results.O7={pass:red.links.length>0&&red.links.every(l=>l.color==='red'),redLinks:red.links.length,queueRecords:blocks.length,coveredQueueRecords:blocks.filter(b=>edges.some(e=>e.unit_id===b.unit_id&&e.produto_venda_ficha_id===b.prato_id)).length,attributed:red.total,ui:'pending'};
const anon=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const access=await anon.from('v_mapa_aresta').select('unit_id').limit(1);
results.security={pass:!!access.error,message:access.error?.message};
await mkdir('docs/prisma-mapa-evidencias',{recursive:true});
await writeFile('docs/prisma-mapa-evidencias/oracles.json',JSON.stringify({at:new Date().toISOString(),results,durations},null,2));
console.log(JSON.stringify({results,durations},null,2));
if(Object.values(results).some(r=>(r as {pass:boolean}).pass===false))process.exitCode=1;

}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
