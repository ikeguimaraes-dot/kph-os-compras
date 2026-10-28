'use server';
import { comprasAccess } from './everest-access';
import { calculateOrder, type DailyDemand, type Incoming } from './automacao';
export type AutomationRow = {
 unit_id:string; item_id:string; nome:string; medida:string; subgrupo:string; pendencias:number;
 estoque:number|null; observado_em:string|null; estoque_validado:boolean;
 embalagem:number|null; minimo_embalagens:number; seguranca:number|null; lead_dias:number|null; porcao_minima:number|null;
 medias:{dow:number;samples:number;quantity:number|null}[]; entregas:Incoming[]; pedidos_conciliados:boolean;
 fonte_atualizada_em:string|null; ultimo_pdv:string|null; lacuna_pdv_recente:boolean; preco_medio:number|null; bloqueio_qualidade:boolean;
};
export async function getAutomation(unit?:string|null) {
 const {db,unitIds:allowedIds,units}=await comprasAccess(unit);
 const active=await db.from('units').select('id').in('id',allowedIds).eq('active',true).eq('is_training',false).not('lorean_code','is',null);
 if(active.error)throw new Error('Não foi possível determinar as casas operacionais.');
 const unitIds=active.data.map(u=>u.id as string);
 const snapshots=await Promise.all(unitIds.map(async id=>{
  const r=await db.from('compras_automacao_execucao').select('resultado,criado_em').eq('unit_id',id).order('criado_em',{ascending:false}).limit(1).maybeSingle();
  if(r.error)throw new Error('Não foi possível ler a conciliação automática.');
  return r.data;
 }));
 const selected=snapshots.filter((s):s is NonNullable<typeof s>=>s!==null);
 if(!selected.length)throw new Error('A primeira conciliação automática ainda não terminou.');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const data={as_of:today,items:selected.flatMap(s=>s.resultado.items??[]),units:units.filter(u=>unitIds.includes(u.id)),coverage:selected.flatMap(s=>s.resultado.coverage??[])};
 const snapshotDates=new Map(selected.flatMap(s=>(s.resultado.units as {id:string}[]).map(u=>[u.id,s.criado_em] as const)));
 const now=new Date().toISOString();
 const items=(data.items as AutomationRow[]).map(row=>{
  const demand:DailyDemand[]=[];
  const horizon=Math.min(67,Math.max(7,(row.lead_dias??0)+7));
  for(let n=0;n<horizon;n++) {
   const day=new Date(data.as_of+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+n);
   const mean=row.medias.find(m=>m.dow===(day.getUTCDay()||7));
   demand.push({date:day.toISOString().slice(0,10),quantity:mean?.quantity??null,samples:mean?.samples??0});
  }
  const snapshotAt=snapshotDates.get(row.unit_id);
  const sourceFresh=!!snapshotAt && Date.parse(now)-Date.parse(snapshotAt)<8*3600000 && !!row.fonte_atualizada_em && Date.parse(now)-Date.parse(row.fonte_atualizada_em)<48*3600000;
  const result=calculateOrder({demand,stock:row.estoque===null||!row.observado_em?null:{quantity:Number(row.estoque),observedAt:row.observado_em,validated:row.estoque_validado},
   incoming:row.entregas,incomingComplete:row.pedidos_conciliados,pack:row.embalagem,minimumPacks:row.minimo_embalagens,safety:row.seguranca,leadDays:row.lead_dias,portion:row.porcao_minima,qualityBlocked:row.bloqueio_qualidade,now});
  if(!sourceFresh||row.lacuna_pdv_recente||row.pendencias>0){
   result.exceptions.push(!sourceFresh?'sincronizacao_consumo_antiga':row.lacuna_pdv_recente?'vendas_sem_baixa_pdv':'movimentos_inconsistentes');
   result.quantity=null;result.packs=null;
   if(result.state!=='86')result.state='nao_comprovado';
  }
  if(row.subgrupo==='PRODUCAO'){result.exceptions.push('repor_por_producao');result.quantity=null;result.packs=null;}
  return {...row,demand,result,estimatedTotal:result.quantity===null||row.preco_medio===null?null:result.quantity*row.preco_medio};
 });
 return {asOf:data.as_of as string,readAt:now,units:data.units as {id:string;name:string}[],coverage:data.coverage as {id:string;dias_vendas:number;dias_eventos:number;dias_conciliados:number}[],items};
}
