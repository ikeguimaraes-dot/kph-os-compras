'use server';
import {readBounded} from './read-bounded';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {comprasAccess} from './everest-access';
export async function getGovernanca(){
 const {db,units,unitIds}=await comprasAccess();
 const [policies,tickets,suppliers,history]=await Promise.all([
  readBounded((from,to)=>db.from('compras_fluxo_politicas').select('*,item:everest_itens(descricao,unidade_medida)').in('unit_id',unitIds).range(from,to),1000),
  readBounded((from,to)=>db.from('compras_operacao_tratativas').select('*').in('unit_id',unitIds).order('atualizado_em',{ascending:false}).range(from,to),1000),
  readBounded((from,to)=>db.from('suppliers').select('id,unit_id,nome').in('unit_id',unitIds).eq('ativo',true).range(from,to),1000),
  db.from('compras_operacao_decisoes').select('id,unit_id,acao,entrada,criado_em,ator').in('unit_id',unitIds).order('criado_em',{ascending:false}).limit(100),
 ]);
 if(policies.error||tickets.error||suppliers.error||history.error)throw Error('Não foi possível carregar as políticas e tratativas.');
 if(policies.data.length>1000||tickets.data.length>1000||suppliers.data.length>1000)throw Error('Consulta excedeu o limite; filtre por casa antes de continuar.');
 return {units,policies:policies.data,tickets:tickets.data,suppliers:suppliers.data,history:history.data};
}
export async function configurarOperacao(raw:unknown){
 try{
  const v=z.object({unit_id:z.uuid(),acao:z.enum(['politica','tratativa']),dados:z.record(z.string(),z.unknown())}).parse(raw);
  if(JSON.stringify(v.dados).length>10000)throw Error('Registro muito longo.');
  const {db,user}=await comprasAccess(v.unit_id,'write');
  const r=await db.rpc('compras_operacao_configurar',{p_ator:user.id,p_unit:v.unit_id,p_acao:v.acao,p_dados:v.dados});
  if(r.error)throw Error(r.error.message);revalidatePath('/compras/automacao');revalidatePath('/compras/operacao');
  return {ok:true as const};
 }catch(e){return {ok:false as const,error:e instanceof Error?e.message:'Registro não concluído.'};}
}
export async function getDestinacao(){
 const {db,unitIds}=await comprasAccess();
 const locals=await readBounded((from,to)=>db.from('compras_fluxo_locais').select('id,unit_id,nome').in('unit_id',unitIds).eq('modo','real').range(from,to),1000);
 if(locals.error||locals.data.length>1000)throw Error('Locais indisponíveis.');
 const ids=locals.data.map(l=>l.id);
 const rows=ids.length?await readBounded((from,to)=>db.from('compras_recebimento_destinos').select('conferencia_id,pedido_item_id,local_id,item_id,fator,quantidade,lote_id').in('local_id',ids).range(from,to),10000):{data:[],error:null};
 if(rows.error||(rows.data?.length??0)>10000)throw Error('Destinações indisponíveis.');return {locals:locals.data,rows:rows.data??[]};
}
export async function recalcularPlanejamento(unit:string){
 try{const id=z.uuid().parse(unit),{db,user}=await comprasAccess(id,'write');
  const r=await db.rpc('compras_operacao_recalcular',{p_ator:user.id,p_unit:id});
  if(r.error)throw Error(r.error.message);revalidatePath('/compras/automacao');return {ok:true as const};
 }catch(e){return {ok:false as const,error:e instanceof Error?e.message:'Consolidação não concluída.'};}
}
export async function destinarRecebimento(raw:unknown){
 try{
  const v=z.object({conferencia:z.uuid(),linha:z.uuid(),local:z.uuid(),item:z.uuid(),fator:z.number().finite().positive().max(1e8),evidencia:z.string().trim().min(3).max(2000)}).parse(raw);
  const {db,user}=await comprasAccess(undefined,'write');
  const r=await db.rpc('compras_recebimento_destinar',{p_ator:user.id,p_conferencia:v.conferencia,p_linha:v.linha,p_local:v.local,p_item:v.item,p_fator:v.fator,p_evidencia:v.evidencia});
  if(r.error)throw Error(r.error.message);revalidatePath('/compras/recebimento');revalidatePath('/compras/logistica');return {ok:true as const};
 }catch(e){return {ok:false as const,error:e instanceof Error?e.message:'Destinação não concluída.'};}
}
