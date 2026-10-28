import {gunzipSync} from 'node:zlib';
import DigitalTwin from '@/components/digital-twin/DigitalTwin';
import {scopeAtlas} from '@/components/digital-twin/scope';
import type {TwinData} from '@/components/digital-twin/model';
import {comprasAccess} from '@/lib/compras/everest-access';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const metadata={title:'Atlas'};

export default async function AtlasPage(){
 // Session + role-per-house checks happen before decoding or exposing data.
 const {unitIds}=await comprasAccess();
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
 return <DigitalTwin data={data} embedded/>;
}
