'use server';
import {readBounded} from './read-bounded';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {comprasAccess} from './everest-access';
import type {FlowData,FlowMode} from './fluxo-types';
const mode=z.enum(['teste','real']);
export async function getFluxo(rawMode:FlowMode):Promise<FlowData>{
 const modo=mode.parse(rawMode),{db,units,unitIds}=await comprasAccess();
 const local=await readBounded((from,to)=>db.from('compras_fluxo_locais').select('*').in('unit_id',unitIds).eq('modo',modo).order('nome').range(from,to),500);
 if(local.error)throw Error('Não foi possível carregar os locais.');
 if((local.data??[]).length>500)throw Error('Limite de locais excedido; solicite uma consulta por casa.');
 const ids=(local.data??[]).map(l=>l.id);
 if(!ids.length)return {modo,units,locais:[],lotes:[],ordens:[],itens:[],reservas:[],eventos:[],limitado:false};
 const [lots,orders,events]=await Promise.all([
  readBounded((from,to)=>db.from('compras_fluxo_lotes').select('*,item:everest_itens(descricao,unidade_medida)').in('local_id',ids).order('contado_em',{ascending:false}).range(from,to),1000),
  readBounded((from,to)=>db.from('compras_fluxo_ordens').select('*').in('origem_id',ids).in('destino_id',ids).eq('modo',modo).order('criado_em',{ascending:false}).range(from,to),200),
  db.from('compras_fluxo_eventos').select('id,acao,modo,entrada,resultado,criado_em,ator').containedBy('unit_ids',unitIds).eq('modo',modo).order('criado_em',{ascending:false}).limit(100),
 ]);
 if(lots.error||orders.error||events.error)throw Error('Leitura operacional incompleta. Tente atualizar.');
 const orderIds=(orders.data??[]).slice(0,200).map(o=>o.id);
 const [lines,reservations]=orderIds.length?await Promise.all([
  readBounded((from,to)=>db.from('compras_fluxo_itens').select('*,item:everest_itens(descricao,unidade_medida)').in('ordem_id',orderIds).range(from,to),20000),
  readBounded((from,to)=>db.from('compras_fluxo_reservas').select('*,lote:compras_fluxo_lotes(lote,validade,item_id)').in('ordem_id',orderIds).range(from,to),20000),
 ]):[{data:[],error:null},{data:[],error:null}];
 if(lines.error||reservations.error||(lines.data?.length??0)>20000||(reservations.data?.length??0)>20000)throw Error('Detalhamento das ordens incompleto.');
 return {modo,units,locais:local.data??[],lotes:(lots.data??[]).slice(0,1000),ordens:(orders.data??[]).slice(0,200),itens:lines.data??[],reservas:reservations.data??[],eventos:events.data??[],limitado:(lots.data?.length??0)>1000||(orders.data?.length??0)>200} as FlowData;
}
export async function buscarItemFluxo(term:string){
 const q=z.string().trim().min(2).max(80).parse(term),{db}=await comprasAccess();
 const r=await db.from('everest_itens').select('id,descricao,unidade_medida,subgrupo').ilike('descricao','%'+q.replaceAll('%','').replaceAll('_','')+'%').order('descricao').limit(40);
 if(r.error)throw Error('Catálogo indisponível.');return r.data;
}
export async function executarFluxo(input:unknown){
 try{
  const v=z.object({modo:mode,chave:z.uuid(),acao:z.enum(['local','contagem','qualidade','criar_ordem','solicitar','aprovar','iniciar','receber','cancelar','encerrar_divergencia']),dados:z.record(z.string(),z.unknown())}).parse(input);
  if(JSON.stringify(v.dados).length>50000)throw Error('Solicitação muito grande.');
  const {db,user}=await comprasAccess(undefined,'write');
  const r=await db.rpc('compras_fluxo_executar',{p_ator:user.id,p_chave:v.chave,p_modo:v.modo,p_acao:v.acao,p_dados:v.dados});
  if(r.error)throw Error(r.error.message);
  revalidatePath('/compras/logistica');revalidatePath('/compras/operacao');
  return {ok:true as const,data:r.data};
 }catch(e){return {ok:false as const,error:e instanceof Error?e.message:'Operação não concluída.'};}
}
