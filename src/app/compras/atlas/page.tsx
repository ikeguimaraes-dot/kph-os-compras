import {gunzipSync,gzipSync} from 'node:zlib';
import AtlasPayload from '@/components/digital-twin/AtlasPayload';
import {getAutomation} from '@/lib/compras/automacao-actions';
import {loadAtlasOperations} from '@/lib/atlas/load';
import {scopeAtlas} from '@/components/digital-twin/scope';
import type {TwinData} from '@/components/digital-twin/model';
import {comprasAccess} from '@/lib/compras/everest-access';

export const runtime='nodejs';
export const maxDuration=60;
export const dynamic='force-dynamic';
export const metadata={title:'Atlas'};

export default async function AtlasPage({searchParams}:{searchParams:Promise<{ano?:string}>}){
 // Session + role-per-house checks happen before decoding or exposing data.
 const {unitIds,db,units}=await comprasAccess();
 const encoded=process.env.ATLAS_SNAPSHOT_GZIP;
 if(!encoded)return <section className="p-8"><h1>Atlas</h1><p>A leitura histórica ainda não está disponível.</p></section>;
 let snapshot:TwinData;
 try {
  snapshot=JSON.parse(gunzipSync(Buffer.from(encoded,'base64'),{maxOutputLength:2_000_000}).toString('utf8'));
 } catch {
  throw new Error('A leitura do Atlas está indisponível.');
 }
 const data=scopeAtlas(snapshot,unitIds);
 if(!data.houses.length)return <section className="p-8"><h1>Atlas</h1><p>Não há leitura disponível para suas casas autorizadas.</p></section>;
 const yearNow=Number(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric'}).format(new Date()));
 const params=await searchParams;const requested=Number(params.ano);
 const year=Number.isInteger(requested)&&requested>=yearNow-2&&requested<=yearNow?requested:yearNow;
 const operationalUnits=units.filter(u=>data.houses.some(h=>h.id===u.id));
 const operations=await loadAtlasOperations(db,operationalUnits,year,getAutomation());
 return <AtlasPayload key={year} data={data} encoded={gzipSync(JSON.stringify(operations)).toString('base64')}/>;
}
