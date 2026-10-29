import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {getAutomation} from '@/lib/compras/automacao-actions';
import {categoryName} from '@/lib/compras/prisma-config';
import {potentialProduction,replenishmentDates,type AtlasCatalog,type AtlasOperations,type AtlasDepot,type AtlasOrder,type AtlasPurchase} from './model';
type Row=Record<string,unknown>;
type PageResult=PromiseLike<{data:unknown[]|null;error:{message:string}|null}>;
async function all(make:(from:number,to:number)=>PageResult){
 const rows:Row[]=[];
 for(let from=0;;from+=1000){const result=await make(from,from+999);if(result.error)throw new Error(result.error.message);const page=(result.data??[]) as Row[];rows.push(...page);if(page.length<1000)break;if(from>=100000)throw new Error('Consulta excedeu o limite de leitura completa.');}
 return rows;
}
const n=(v:unknown):number|null=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const s=(v:unknown)=>v==null?'':String(v);
const root=(cnpj:unknown,id:unknown)=>{const digits=s(cnpj).replace(/\D/g,'');return digits.length===14?digits.slice(0,8):`supplier:${s(id)}`;};
export async function loadAtlasOperations(db:SupabaseClient,units:{id:string;name:string}[],year:number,automationRead:Promise<Awaited<ReturnType<typeof getAutomation>>|null>):Promise<AtlasOperations>{
 const ids=units.map(u=>u.id),readAt=new Date().toISOString();
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const start=`${year}-01-01`,end=year===Number(today.slice(0,4))?today:`${year}-12-31`;
 const warnings:string[]=[];
 const optional=async(label:string,fn:()=>Promise<Row[]>)=>{try{return await fn();}catch{warnings.push(`${label}: consulta indisponível; não representa zero.`);return [];}};
 const [catalogRows,notes,supplierRows,orders,localSuppliers,depotRows,saldoRows,costs,recipes,components,prices,automation]=await Promise.all([
 all((a,b)=>db.from('everest_itens').select('id,cd_item,everest_codigo,descricao,unidade_medida,grupo,subgrupo').order('id').range(a,b)),
 all((a,b)=>db.from('everest_notas_recebidas_atuais').select('id,unit_id,fornecedor_id,nr_nota,dt_lancamento').in('unit_id',ids).gte('dt_lancamento',start).lte('dt_lancamento',end).order('id').range(a,b)),
 all((a,b)=>db.from('everest_fornecedores').select('id,unit_id,cpf_cnpj,nome_fantasia,razao_social').in('unit_id',ids).order('id').range(a,b)),
 optional('Pedidos',()=>all((a,b)=>db.from('purchase_orders').select('id,unit_id,numero,status,data_pedido,data_prevista,fornecedor,supplier_id,valor_total,purchase_order_items(id,nome,unidade,quantidade,quantidade_recebida)').in('unit_id',ids).order('id').range(a,b))),
 optional('Cadastro de fornecedores dos pedidos',()=>all((a,b)=>db.from('suppliers').select('id,unit_id,nome,cnpj').in('unit_id',ids).order('id').range(a,b))),
 optional('Depósitos',()=>all((a,b)=>db.from('everest_estoque_depositos').select('*').in('unit_id',ids).eq('ativo',true).eq('planejamento',true).order('unit_id').order('empresa').order('deposito').range(a,b))),
 optional('Saldos',()=>all((a,b)=>db.from('everest_estoque_saldos').select('unit_id,empresa,deposito,concluido_em,total,registros').in('unit_id',ids).order('unit_id').order('empresa').order('deposito').range(a,b))),
 optional('Fichas por casa',()=>all((a,b)=>db.from('everest_fichas_tecnicas_custo').select('unit_id,ficha_id').in('unit_id',ids).order('id').range(a,b))),
 optional('Fichas técnicas',()=>all((a,b)=>db.from('everest_fichas_tecnicas').select('id,item_pai_id,qt_producao,versao,situacao').eq('situacao',1).order('id').range(a,b))),
 optional('Componentes',()=>all((a,b)=>db.from('everest_fichas_tecnicas_itens').select('id,ficha_id,insumo_id,qt_aplicada,pr_aproveitamento').order('id').range(a,b))),
 optional('Preços históricos',()=>all((a,b)=>db.from('compras_automacao_referencia_comercial').select('unit_id,item_id,preco_base,dt_lancamento,conversao_consistente').in('unit_id',ids).eq('conversao_consistente',true).lte('dt_lancamento',today).order('dt_lancamento',{ascending:false}).order('nota_item_id').range(a,b))),
 automationRead.catch(()=>{warnings.push('Projeção de reposição indisponível.');return null;}),
 ]);
 const catalog=new Map((catalogRows as unknown as AtlasCatalog[]).map(i=>[i.id,i]));
 const byCode=new Map((catalogRows as unknown as AtlasCatalog[]).map(i=>[`${i.cd_item}:${i.everest_codigo}`,i]));
 const suppliers=new Map(supplierRows.map(r=>[s(r.id),r]));
 const purchaseLines:Row[]=[];
 for(let i=0;i<notes.length;i+=150){const slice=notes.slice(i,i+150).map(r=>s(r.id));purchaseLines.push(...await all((a,b)=>db.from('everest_notas_recebidas_itens').select('id,nota_id,item_id,vl_total').in('nota_id',slice).eq('entra_cmv_cfop',true).order('id').range(a,b)));}
 const noteMap=new Map(notes.map(r=>[s(r.id),r]));
 const invalidValues=purchaseLines.filter(r=>n(r.vl_total)===null);
 if(invalidValues.length)warnings.push(`${invalidValues.length} linhas sem valor válido excluídas dos totais.`);
 const purchases:AtlasPurchase[]=purchaseLines.filter(r=>n(r.vl_total)!==null).map(r=>{
  const note=noteMap.get(s(r.nota_id))!,supplier=suppliers.get(s(note.fornecedor_id)),item=catalog.get(s(r.item_id));
  return {id:s(r.id),unitId:s(note.unit_id),date:s(note.dt_lancamento),month:s(note.dt_lancamento).slice(0,7),invoice:s(note.nr_nota),itemId:item?.id??null,item:item?.descricao??'Item sem identificação',category:categoryName(item?.grupo??'Sem classificação'),supplierId:root(supplier?.cpf_cnpj,note.fornecedor_id??note.id),supplier:s(supplier?.nome_fantasia||supplier?.razao_social)||'Fornecedor sem identificação',value:n(r.vl_total)??0};
 });
 const localMap=new Map(localSuppliers.map(r=>[s(r.id),r]));
 const orderIds=orders.flatMap(o=>(o.purchase_order_items as Row[]??[]).map(i=>s(i.id)));
 const orderLinks:Row[]=[];
 for(let i=0;i<orderIds.length;i+=150)orderLinks.push(...await all((a,b)=>db.from('compras_automacao_pedido_item').select('pedido_item_id,item_id').in('pedido_item_id',orderIds.slice(i,i+150)).order('pedido_item_id').range(a,b)));
 const linkMap=new Map(orderLinks.map(r=>[s(r.pedido_item_id),s(r.item_id)]));
 const liveOrders:AtlasOrder[]=orders.map(o=>{const vendor=localMap.get(s(o.supplier_id));return {id:s(o.id),unitId:s(o.unit_id),number:s(o.numero),status:s(o.status),date:s(o.data_pedido),eta:o.data_prevista?s(o.data_prevista):null,supplierId:vendor&&vendor.unit_id===o.unit_id?root(vendor.cnpj,vendor.id):null,supplier:s(vendor?.nome||o.fornecedor)||null,value:n(o.valor_total),lines:((o.purchase_order_items??[]) as Row[]).map(l=>({id:s(l.id),name:s(l.nome),unit:s(l.unidade),quantity:n(l.quantidade)??0,received:n(l.quantidade_recebida)??0,itemId:linkMap.get(s(l.id))??null}))};});
 const priceMap=new Map<string,Row>();for(const p of prices){const key=`${p.unit_id}:${p.item_id}`;if(!priceMap.has(key))priceMap.set(key,p);}
 const depots:AtlasDepot[]=depotRows.map(d=>{
  const saldo=saldoRows.find(r=>r.unit_id===d.unit_id&&r.empresa===d.empresa&&r.deposito===d.deposito);
  const records=Array.isArray(saldo?.registros)?saldo.registros as Row[]:[];
  const complete=!!saldo&&n(saldo.total)===records.length&&records.every(r=>n(r.cd_empresa)===n(d.empresa)&&n(r.cd_deposito)===n(d.deposito));
  const age=saldo?.concluido_em?Date.parse(readAt)-Date.parse(s(saldo.concluido_em)):Infinity;
  const counts=new Map<string,number>();for(const r of records){const k=`${r.cd_item}:${r.id_item}`;counts.set(k,(counts.get(k)??0)+1);}
  return {id:`${d.unit_id}:${d.empresa}:${d.deposito}`,unitId:s(d.unit_id),company:Number(d.empresa),code:Number(d.deposito),name:s(d.nome),at:saldo?.concluido_em?s(saldo.concluido_em):null,complete,stocks:records.flatMap(r=>{
   const key=`${r.cd_item}:${r.id_item}`,item=byCode.get(key);if(!item)return [];
   const quantity=n(r.qt_estoque),price=priceMap.get(`${d.unit_id}:${item.id}`);
   const reason=!complete?'Coleta incompleta':counts.get(key)!==1?'Saldo duplicado':s(r.sg_unidademedida).trim().toUpperCase()!==item.unidade_medida?.trim().toUpperCase()?'Unidade divergente':quantity===null?'Quantidade ausente':quantity<0?'Saldo negativo':!Number.isFinite(age)||age<0||age>8*3600000?'Posição desatualizada':null;
   return [{itemId:item.id,name:item.descricao,code:item.cd_item,unit:item.unidade_medida,category:categoryName(item.grupo),group:item.subgrupo,quantity,usable:reason===null,reason,historicalPrice:price?n(price.preco_base):null,priceDate:price?s(price.dt_lancamento):null}];
  })};
 });
 const componentMap=new Map<string,Row[]>();for(const c of components){const list=componentMap.get(s(c.ficha_id))??[];list.push(c);componentMap.set(s(c.ficha_id),list);}
 const memberships=new Set(costs.map(c=>`${c.unit_id}:${c.ficha_id}`));
 const capacity:AtlasOperations['capacity']=[];
 for(const depot of depots){
  const choices=new Map<string,Row[]>();for(const recipe of recipes){if(!memberships.has(`${depot.unitId}:${recipe.id}`))continue;const id=s(recipe.item_pai_id);const list=choices.get(id)??[];list.push(recipe);choices.set(id,list);}
  const selected=new Map([...choices].map(([id,rs])=>[id,rs.sort((a,b)=>Number(b.versao)-Number(a.versao))[0]!]));
  const protein=(id:string,path:string[]=[]):boolean=>{
   if(path.includes(id)||path.length>8)return false;
   if(catalog.get(id)?.grupo==='A. PROTEINAS')return true;
   const recipe=selected.get(id);return !!recipe&&(componentMap.get(s(recipe.id))??[]).some(c=>protein(s(c.insumo_id),[...path,id]));
  };
  for(const [itemId,recipe] of selected){const item=catalog.get(itemId);if(!item||item.subgrupo!=='PRODUCAO'||!protein(itemId))continue;
   const used=(componentMap.get(s(recipe.id))??[]).map(c=>({id:c.insumo_id?s(c.insumo_id):null,name:catalog.get(s(c.insumo_id))?.descricao??'Componente sem identificação',quantity:n(c.qt_aplicada)??NaN,utilization:n(c.pr_aproveitamento)}));
   const result=potentialProduction(Number(recipe.qt_producao),used,depot.stocks,depot.complete);
   if((choices.get(itemId)??[]).filter(r=>r.versao===recipe.versao).length>1){result.issues.push('Mais de uma ficha ativa na mesma versão');result.possible=null;}
   const ready=depot.stocks.find(r=>r.itemId===itemId);
   capacity.push({id:s(recipe.id),unitId:depot.unitId,depotId:depot.id,itemId,name:item.descricao,unit:item.unidade_medida,yield:Number(recipe.qt_producao),ready:ready?.usable?ready.quantity:null,...result});
  }
 }
 const replenishment=(automation?.items??[]).filter(r=>ids.includes(r.unit_id)).map(r=>{
  const forecast=replenishmentDates({stock:r.result.stock,safety:r.seguranca,leadDays:r.lead_dias,demand:r.demand,incoming:r.entregas,exceptions:r.result.exceptions});
  return {unitId:r.unit_id,itemId:r.item_id,name:r.nome,unit:r.medida,group:r.subgrupo,category:categoryName(catalog.get(r.item_id)?.grupo??'Sem classificação'),stock:r.result.stock,at:r.observado_em,minimum:r.seguranca,demand:r.result.demand,...forecast,quantity:r.result.quantity,state:r.result.state,issues:r.result.exceptions};
 });
 return {readAt,year,start,end,units,purchases,orders:liveOrders,depots,capacity,replenishment,warnings};
}
