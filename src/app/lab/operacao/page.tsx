import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import DigitalTwin from '@/components/digital-twin/DigitalTwin';
import type {TwinData} from '@/components/digital-twin/model';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const metadata={title:'Atlas · GHOST — laboratório local'};
export default async function Page(){
 const host=(await headers()).get('host')??'';
 if(process.env.NODE_ENV!=='development'||! /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))notFound();
 let data:TwinData;
 try {data=JSON.parse(await readFile(join(process.cwd(),'.local/twin-snapshot.json'),'utf8'));}
 catch {return <main style={{padding:48}}><h1>Atlas · snapshot local indisponível</h1><p>Prepare a leitura privada em .local/twin-snapshot.json para explorar dados reais.</p></main>;}
 try {data.network=JSON.parse(await readFile(join(process.cwd(),'.local/atlas-network.json'),'utf8'));}catch{/* V1 remains usable when the private V2 snapshot is absent. */}
 try {const activity=JSON.parse(await readFile(join(process.cwd(),'.local/atlas-activity.json'),'utf8'));delete activity.query;data.activity=activity;}catch{/* Optional historical activity. */}
 return <DigitalTwin data={data}/>;
}
