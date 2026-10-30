import {createClient} from 'npm:@supabase/supabase-js@2.106.2';

function equal(a:string|null,b:string|undefined){if(!a||!b||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
const cors={'Access-Control-Allow-Origin':'https://kph-os.vercel.app','Access-Control-Allow-Methods':'POST,GET,OPTIONS','Access-Control-Allow-Headers':'apikey,Content-Type','Cache-Control':'no-store'};
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 const key=Deno.env.get('KPH_BACKEND_SECRET_KEY');
 if(!equal(req.headers.get('apikey'),key))return Response.json({error:'unauthorized'},{status:401,headers:cors});
 if(req.method==='GET'&&new URL(req.url).searchParams.get('health')==='1')return Response.json({configured:Boolean(Deno.env.get('RESEND_API_KEY'))},{headers:cors});
 if(req.method!=='POST')return new Response(null,{status:405,headers:cors});
 const db=createClient(Deno.env.get('SUPABASE_URL')!,key!,{auth:{persistSession:false},global:{fetch:(u,o)=>{
  const h=new Headers(o?.headers);if(/^Bearer sb_/.test(h.get('Authorization')??''))h.delete('Authorization');
  return fetch(u,{...o,headers:h,signal:AbortSignal.timeout(8000)});
 }}});
 try{
  const body=await req.json();if(typeof body.watch_id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.watch_id))return Response.json({error:'invalid id'},{status:400,headers:cors});
  const r=await db.from('compras_integracao_watch').select('*').eq('id',body.watch_id).single();
  if(r.error||!r.data)return Response.json({error:'not found'},{status:404,headers:cors});
  const w=r.data;
  if(w.email_sent_at)return Response.json({sent:true,already_sent:true},{headers:cors});
  if(!['found','expired'].includes(w.status)||!w.notice_title||!w.notice_message)return Response.json({error:'not ready'},{status:409,headers:cors});
  if(w.email_first_attempt_at&&Date.now()-Date.parse(w.email_first_attempt_at)>20*3600000){
   await db.from('compras_integracao_watch').update({email_error:'Janela segura de repetição encerrada; conferir entrega antes de reenviar.'}).eq('id',w.id);
   return Response.json({error:'delivery review required'},{status:409,headers:cors});
  }
  const apiKey=Deno.env.get('RESEND_API_KEY');if(!apiKey)throw Error('Serviço de e-mail não configurado');
  if(!w.email_first_attempt_at){
   const stamp=await db.from('compras_integracao_watch').update({email_first_attempt_at:new Date().toISOString()}).eq('id',w.id).is('email_first_attempt_at',null);
   if(stamp.error)throw Error('Falha ao registrar tentativa');
  }
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`compras-integracao/${w.id}/${w.status}`},
   body:JSON.stringify({from:'GHOST <notificacoes@freneze.com.br>',to:[w.email],subject:`GHOST · ${w.notice_title}`,text:`${w.notice_title}\n\n${w.notice_message}\n\nVeja o acompanhamento e a evidência em https://kph-os.vercel.app/compras/avisos\n\nEste aviso é enviado uma vez por casa e data acompanhada.`}),signal:AbortSignal.timeout(8000)});
  if(!response.ok){
   await db.from('compras_integracao_watch').update({email_error:`Provedor de e-mail HTTP ${response.status}; nova tentativa com a mesma chave.`}).eq('id',w.id);
   return Response.json({error:'email provider unavailable'},{status:502,headers:cors});
  }
  const result=await response.json();if(typeof result.id!=='string')throw Error('Provedor sem identificação do envio');
  const saved=await db.from('compras_integracao_watch').update({email_sent_at:new Date().toISOString(),email_provider_id:result.id,email_error:null}).eq('id',w.id);
  if(saved.error)throw Error('Falha ao registrar aceite do provedor');
  return Response.json({sent:true},{headers:cors});
 }catch{return Response.json({error:'email pending'},{status:503,headers:cors});}
});
