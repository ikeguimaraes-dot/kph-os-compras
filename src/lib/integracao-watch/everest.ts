import type { SupabaseClient } from '@supabase/supabase-js';

export type Evidence = { id:number; empresa:number; dia:string; linhas:number; observacao:string|null };
type Movement = { id_movimentoestoque:number; cd_empresa:number; dt_movimento:string; at_situacao:number; ds_movimentoestoquetipo_origem:string; observacao?:string; itens:unknown[] };
export function selectEvidence(rows:Movement[], company:number, day:string):Evidence[]{
 const seen=new Set<number>();
 for(const r of rows){
  if(!Number.isSafeInteger(r.id_movimentoestoque)||r.id_movimentoestoque<=0||seen.has(r.id_movimentoestoque)||r.cd_empresa!==company||r.dt_movimento!==day||![1,3].includes(r.at_situacao)||!Array.isArray(r.itens))throw Error('Movimento inválido ou fora do escopo');
  seen.add(r.id_movimentoestoque);
 }
 return rows.filter(r=>r.at_situacao===1&&r.ds_movimentoestoquetipo_origem==='VENDA DO DIA (INTEGRACAO PDV)'&&r.itens.length>0)
 .map(r=>({id:r.id_movimentoestoque,empresa:r.cd_empresa,dia:r.dt_movimento,linhas:r.itens.length,observacao:r.observacao??null}));
}
export function validatePage(total:number,pages:number,expected:{total:number;pages:number}|null){
 if(!Number.isSafeInteger(total)||total<0||!Number.isSafeInteger(pages)||pages<0||pages>100||(total>0&&pages===0)||(total===0&&pages>1)||expected&&(expected.total!==total||expected.pages!==pages))throw Error('Paginação não comprovada');
}
export async function readMovementDay(db:SupabaseClient,company:number,day:string,deadline:number):Promise<Evidence[]>{
 const base=process.env.COMPRAS_EVEREST_BASE_URL,user=process.env.COMPRAS_EVEREST_USUARIO,password=process.env.COMPRAS_EVEREST_SENHA,entity=process.env.COMPRAS_EVEREST_ENTIDADE;
 if(!base?.startsWith('https://')||!user||!password||!entity)throw Error('Acesso de leitura Everest não configurado');
 const rows:Movement[]=[];let expected:{total:number;pages:number}|null=null;
 for(let page=1;page<=100;page++){
  if(Date.now()>deadline-16000)throw Error('Consulta incompleta: limite de execução');
  const url=new URL(base.replace(/\/$/,'')+'/adm/movimentoestoque');
  for(const [k,v] of Object.entries({'x-Entidade':entity,'x-Pagina':String(page),cd_empresa:String(company),movimento_ini:day,movimento_fin:day,ls_situacao:'1,3'}))url.searchParams.set(k,v);
  let callId:string|null=null;
  while(!callId){
   if(Date.now()>deadline-16000)throw Error('Fila Everest ocupada; tentar na próxima execução');
   const r=await db.rpc('everest_acquire_request',{p_scope:'acom-everest',p_endpoint:'/adm/movimentoestoque',p_attempt:1,p_job:null,p_token:null});
   if(r.error)throw Error('Coordenador Everest indisponível');
   if(r.data?.allowed&&typeof r.data.call_id==='string')callId=r.data.call_id;
   else if(r.data?.allowed===false&&Number.isFinite(r.data.wait_ms)&&r.data.wait_ms>0)await new Promise(r2=>setTimeout(r2,Math.min(r.data.wait_ms,3000)));
   else throw Error('Resposta inválida do coordenador');
  }
  const start=Date.now();let status:number|null=null,body='',headers:Headers|null=null;
  try{
   const response=await fetch(url,{method:'GET',headers:{Authorization:'Basic '+Buffer.from(`${user}:${password}`).toString('base64'),Accept:'application/json'},signal:AbortSignal.timeout(15000),cache:'no-store'});
   status=response.status;headers=response.headers;body=await response.text();
  }finally{
   const finished=await db.rpc('everest_finish_request',{p_call:callId,p_status:status,p_outcome:status===null?'network_error':'http',p_duration_ms:Date.now()-start,p_cooldown_ms:status===412||status===429||status!==null&&status>=500?60000:0});
   if(finished.error)throw Error('Não foi possível finalizar a consulta no coordenador');
  }
  if(status!==200)throw Error(`API Everest HTTP ${status??'sem resposta'}`);
  if(!headers?.has('x-Registros')||!headers.has('x-Paginas'))throw Error('API sem contagens de paginação');
  const total=Number(headers.get('x-Registros')),pages=Number(headers.get('x-Paginas'));
  validatePage(total,pages,expected);expected={total,pages};
  const parsed:unknown=JSON.parse(body);const data=Array.isArray(parsed)?parsed:parsed&&typeof parsed==='object'&&Object.keys(parsed).length===0?[]:null;
  if(!data)throw Error('Formato de resposta Everest inválido');
  rows.push(...data);
  if(page>=Math.max(1,pages)){
   if(rows.length!==total)throw Error('Leitura de movimentos incompleta');
   return selectEvidence(rows,company,day);
  }
  if(!data.length||rows.length>total)throw Error('Paginação inconsistente');
 }
 throw Error('Limite de páginas excedido');
}
