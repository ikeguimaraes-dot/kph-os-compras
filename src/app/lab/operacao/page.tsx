import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import PendingClient from '@/app/compras/pendencias/pending-client';
import type {PendingData} from '@/lib/pendencias/model';
import type {AtlasOperations} from '@/lib/atlas/model';
import {gzipSync} from 'node:zlib';
import AtlasPayload from '@/components/digital-twin/AtlasPayload';
import DigitalTwin from '@/components/digital-twin/DigitalTwin';
import type {TwinData} from '@/components/digital-twin/model';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const metadata={title:'Atlas · GHOST — laboratório local'};
export default async function Page({searchParams}:{searchParams:Promise<{v?:string}>}){
 const host=(await headers()).get('host')??'';
 if(process.env.NODE_ENV!=='development'||! /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))notFound();
 let data:TwinData;
 try {data=JSON.parse(await readFile(join(process.cwd(),'.local/twin-snapshot.json'),'utf8'));}
 catch {return <main style={{padding:48}}><h1>Atlas · snapshot local indisponível</h1><p>Prepare a leitura privada em .local/twin-snapshot.json para explorar dados reais.</p></main>;}
 try {data.network=JSON.parse(await readFile(join(process.cwd(),'.local/atlas-network.json'),'utf8'));}catch{/* V1 remains usable when the private V2 snapshot is absent. */}
 try {const activity=JSON.parse(await readFile(join(process.cwd(),'.local/atlas-activity.json'),'utf8'));delete activity.query;data.activity=activity;}catch{/* Optional historical activity. */}
 const version=(await searchParams).v;
 if(version==='pendencias'){
  let pending:PendingData|null=null;
  try {pending=JSON.parse(await readFile(join(process.cwd(),'.local/pendencias-test.json'),'utf8'));}catch{/* Local read-only diagnostic not prepared. */}
  if(pending)return <PendingClient encoded={gzipSync(JSON.stringify(pending)).toString('base64')} initial={{}}/>;
 }
 if(version==='4'){
  let operations:AtlasOperations|null=null;
  try {operations=JSON.parse(await readFile(join(process.cwd(),'.local/atlas-live-test.json'),'utf8'));}catch{/* Private V4 reading not prepared. */}
  if(operations)return <AtlasPayload data={data} encoded={gzipSync(JSON.stringify(operations)).toString('base64')}/>;
 }
 return <DigitalTwin data={data}/>;
}
