'use server';
import {requireUser} from '@kph/auth/server';
import {createClient} from '@supabase/supabase-js';
export type WatchNotice={id:string;dia:string;status:string;checked_at:string|null;found_at:string|null;expires_at:string;last_error:string|null;email_sent_at:string|null;email_error:string|null;evidence:{id:number;linhas:number;observacao:string|null}[]|null;units:{name:string}|null};
export async function getIntegrationWatches():Promise<WatchNotice[]>{
 const user=await requireUser();
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
 const r=await db.from('compras_integracao_watch').select('id,dia,status,checked_at,found_at,expires_at,last_error,email_sent_at,email_error,evidence,units(name)').eq('user_id',user.id).order('criado_em',{ascending:false}).limit(20);
 if(r.error)throw Error('Não foi possível consultar os avisos');
 return r.data as unknown as WatchNotice[];
}
export async function getWatchSnapshot(){return {rows:await getIntegrationWatches(),readAt:Date.now()};}
