import {gzipSync} from 'node:zlib';
import {comprasAccess} from '@/lib/compras/everest-access';
import {getAutomation} from '@/lib/compras/automacao-actions';
import {loadAtlasOperations} from '@/lib/atlas/load';
import {buildOperationalPendings} from '@/lib/pendencias/model';
import type {AtlasOperations} from '@/lib/atlas/model';
import PendingClient from './pending-client';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export const metadata={title:'Pendências operacionais'};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const {db,units,unitIds}=await comprasAccess();
 const active=await db.from('units').select('id').in('id',unitIds).eq('active',true).eq('is_training',false).not('lorean_code','is',null);
 if(active.error)throw new Error('Não foi possível determinar as casas operacionais autorizadas.');
 const selected=units.filter(u=>active.data.some(r=>r.id===u.id));
 if(!selected.length)return <section className="p-8"><h1>Pendências operacionais</h1><p>Nenhuma casa operacional autorizada para esta leitura.</p></section>;
 const params=await searchParams;
 const readAt=new Date().toISOString();
 const yearNow=Number(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric'}).format(new Date()));
 const requested=Number(params.year);
 const year=Number.isInteger(requested)&&requested>=yearNow-2&&requested<=yearNow?requested:yearNow;
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 let operations:AtlasOperations;
 try {operations=await loadAtlasOperations(db,selected,year,getAutomation());}
 catch {operations={readAt,year,start:`${year}-01-01`,end:today,units:selected,purchases:[],orders:[],depots:[],capacity:[],replenishment:[],warnings:['Leitura operacional indisponível. A fila está incompleta; isto não significa ausência de pendências.']};}
 const data=buildOperationalPendings(operations);
 const initial=Object.fromEntries(['unit','source','code','owner','severity','q','year'].map(k=>[k,typeof params[k]==='string'?params[k]:''])) as Record<string,string>;
 return <PendingClient key={data.readAt} encoded={gzipSync(JSON.stringify(data)).toString('base64')} initial={initial}/>;
}
