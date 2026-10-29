'use client';
import {useEffect,useState} from 'react';
import AtlasV4 from './AtlasV4';
import type {TwinData} from './model';
import type {AtlasOperations} from '@/lib/atlas/model';

// Authorized on the server before compression. Keeps the full year's evidence
// without shipping repeated item/supplier names as a multi-megabyte RSC payload.
export default function AtlasPayload({data,encoded}:{data:TwinData;encoded:string}){
 const [operations,setOperations]=useState<AtlasOperations|null>(null);
 const [error,setError]=useState(false);
 useEffect(()=>{
  let active=true;
  async function decode(){
   const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
   const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
   const value=JSON.parse(await new Response(stream).text()) as AtlasOperations;
   if(active)setOperations(value);
  }
  void decode().catch(()=>{if(active)setError(true);});
  return ()=>{active=false;};
 },[encoded]);
 if(error)return <section className="p-8"><h1>Atlas</h1><p>Não foi possível abrir a leitura. Atualize a página em um navegador recente.</p></section>;
 if(!operations)return <section className="p-8" role="status"><h1>Atlas</h1><p>Preparando a visão operacional…</p></section>;
 return <AtlasV4 data={data} operations={operations}/>;
}
