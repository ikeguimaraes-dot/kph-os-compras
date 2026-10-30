import {timingSafeEqual} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {readMovementDay} from '@/lib/integracao-watch/everest';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const headers={'Access-Control-Allow-Origin':'https://kph-os.vercel.app','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Cache-Control':'no-store','Vary':'Origin'};
export async function OPTIONS(){return new Response(null,{status:204,headers});}
export async function POST(req:Request){
 const token=process.env.COMPRAS_WATCH_CRON_SECRET,auth=req.headers.get('authorization');
 if(!token||!auth||Buffer.byteLength(auth)!==Buffer.byteLength('Bearer '+token)||!timingSafeEqual(Buffer.from(auth),Buffer.from('Bearer '+token)))return Response.json({error:'Não autorizado'},{status:401,headers});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return Response.json({error:'Serviço indisponível'},{status:503,headers});
 const db=createClient(url,key,{auth:{persistSession:false},global:{fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(10000)})}});
 const deadline=Date.now()+48000;const results:{id:string;status:string}[]=[];
 const claimed=await db.rpc('compras_watch_claim');
 if(claimed.error)return Response.json({error:'Falha ao reservar acompanhamento'},{status:503,headers});
 for(const w of claimed.data??[]){
  try{
   let evidence=null,error:string|null=null;
   if(w.status==='pending'&&Date.parse(w.expires_at)>Date.now()){
    try{const found=await readMovementDay(db,w.empresa,w.dia,deadline);evidence=found.length?found:null;}
    catch(e){error=e instanceof Error?e.message:'Falha na consulta';}
   }
   const saved=await db.rpc('compras_watch_finish',{p_id:w.id,p_lease:w.lease_id,p_evidence:evidence,p_error:error});
   if(saved.error)throw Error('Falha ao registrar verificação');
   const row=saved.data;
   if(row.status!=='pending'&&!row.email_sent_at){
    const email=await fetch(url+'/functions/v1/compras-integracao-email',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({watch_id:w.id}),signal:AbortSignal.timeout(10000)});
    if(!email.ok)throw Error('Aviso no GHOST registrado; envio de e-mail pendente');
   }
   results.push({id:w.id,status:error?'consulta_pendente':row.status});
  }catch(e){
   await db.from('compras_integracao_watch').update({last_error:e instanceof Error?e.message:'Falha no acompanhamento',checked_at:new Date().toISOString()}).eq('id',w.id).eq('lease_id',w.lease_id);
   results.push({id:w.id,status:'erro'});
  }finally{
   await db.from('compras_integracao_watch').update({lease_id:null,lease_until:null}).eq('id',w.id).eq('lease_id',w.lease_id);
  }
 }
 return Response.json({processed:results.length,results},{headers});
}
