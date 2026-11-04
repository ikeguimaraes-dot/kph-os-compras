'use server';
import {readBounded} from './read-bounded';
import {comprasAccess} from './everest-access';
import {calculateOrder,type DailyDemand,type Incoming} from './automacao';
import {getGovernanca} from './governanca-actions';
type Row={unit_id:string;item_id:string;nome:string;medida:string;subgrupo:string;pendencias:number;estoque:number|null;observado_em:string|null;estoque_validado:boolean;embalagem:number|null;minimo_embalagens:number;seguranca:number|null;lead_dias:number|null;porcao_minima:number|null;medias:{dow:number;samples:number;quantity:number|null}[];entregas:Incoming[];pedidos_conciliados:boolean;fonte_atualizada_em:string|null;ultimo_pdv:string|null;lacuna_pdv_recente:boolean;preco_medio:number|null;bloqueio_qualidade:boolean};
export async function getAutomation(){
 const {db,unitIds,units}=await comprasAccess();
 const [active,governance]=await Promise.all([db.from('units').select('id').in('id',unitIds).eq('active',true).eq('is_training',false).not('lorean_code','is',null),getGovernanca()]);
 if(active.error)throw Error('Casas operacionais indisponíveis.');
 const ids=active.data.map(u=>u.id as string);
 const snapshots=await Promise.all(ids.map(async unit_id=>{const r=await db.from('compras_automacao_execucao').select('resultado,criado_em').eq('unit_id',unit_id).order('criado_em',{ascending:false}).limit(1).maybeSingle();if(r.error)throw Error('Conciliação indisponível.');return {unit_id,snapshot:r.data};}));
 const [policies,presentations]=await Promise.all([
  readBounded((from,to)=>db.from('compras_estoque_minimo').select('unit_id,insumo_id,origem_reposicao').in('unit_id',ids).range(from,to),10000),
  readBounded((from,to)=>db.from('compras_estoque_apresentacoes').select('unit_id,insumo_id').in('unit_id',ids).range(from,to),10000),
 ]);
 if(policies.error||presentations.error||(policies.data?.length??0)>10000||(presentations.data?.length??0)>10000)throw Error('Cadastro de reposição incompleto.');
 const now=new Date().toISOString(),today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const items=snapshots.flatMap(({unit_id,snapshot})=>((snapshot?.resultado?.items??[]) as Row[]).filter(r=>r.unit_id===unit_id).map(row=>{
  const policy=governance.policies.find(p=>p.unit_id===unit_id&&p.item_id===row.item_id);
  const origin=policies.data?.find(p=>p.unit_id===unit_id&&p.insumo_id===row.item_id)?.origem_reposicao??null;
  const demand:DailyDemand[]=[],lead=policy?.lead_dias??row.lead_dias;
  for(let n=0;n<Math.min(67,Math.max(7,(lead??0)+7));n++){const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);const mean=row.medias.find(m=>m.dow===(d.getUTCDay()||7));demand.push({date:d.toISOString().slice(0,10),quantity:mean?.quantity??null,samples:mean?.samples??0});}
  const result=calculateOrder({demand,stock:row.estoque===null||!row.observado_em?null:{quantity:Number(row.estoque),observedAt:row.observado_em,validated:row.estoque_validado},incoming:row.entregas,incomingComplete:row.pedidos_conciliados,pack:policy?.embalagem??row.embalagem,minimumPacks:policy?.minimo_embalagens??row.minimo_embalagens,safety:policy?.seguranca??row.seguranca,leadDays:lead,portion:policy?.porcao_minima??row.porcao_minima,qualityBlocked:row.bloqueio_qualidade,now});
  const sourceFresh=!!snapshot && Date.parse(now)-Date.parse(snapshot.criado_em)>=0 && Date.parse(now)-Date.parse(snapshot.criado_em)<=8*3600000 && !!row.fonte_atualizada_em && Date.parse(now)-Date.parse(row.fonte_atualizada_em)<=48*3600000;
  const blocks:string[]=[];
  if(!sourceFresh)blocks.push('consolidacao_antiga');
  if(row.lacuna_pdv_recente)blocks.push('vendas_sem_baixa_pdv');
  if(row.pendencias>0)blocks.push('movimentos_inconsistentes');
  if(presentations.data?.some(p=>p.unit_id===unit_id&&p.insumo_id===row.item_id))blocks.push('apresentacoes_separadas');
  if(origin!=='compra')blocks.push(origin?'repor_por_'+origin:'origem_de_reposicao_pendente');
  if(row.subgrupo==='PRODUCAO')blocks.push('composicao_de_producao_pendente');
  if(blocks.length){result.quantity=null;result.packs=null;result.state='nao_comprovado';result.exceptions.push(...blocks);}
  const governanceBlocks=['conciliacao_fisica_e_baixas_pendente','emissao_externa_nao_homologada'];
  if(!policy||policy.modo!=='simulacao')governanceBlocks.push('politica_bloqueada');
  if(!policy?.fornecedor_id||!policy.preco_unitario||!policy.cotacao_valida_ate||policy.cotacao_valida_ate<today)governanceBlocks.push('cotacao_vigente_pendente');
  const value=result.quantity!==null&&policy?.preco_unitario?result.quantity*Number(policy.preco_unitario):null;
  if(policy&&result.quantity!==null&&(result.quantity>Number(policy.limite_quantidade)||(value!==null&&value>Number(policy.limite_valor))))governanceBlocks.push('limite_da_politica_excedido');
  return {...row,demand,result,origin,estimatedTotal:value,governanceBlocks,snapshotAt:snapshot?.criado_em??null};
 }));
 return {asOf:today,readAt:now,units:units.filter(u=>ids.includes(u.id)),missingUnits:snapshots.filter(s=>!s.snapshot).map(s=>s.unit_id),items,governance};
}
