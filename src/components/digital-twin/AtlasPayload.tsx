'use client';
import {useCompressedData} from './use-compressed-data';
import AtlasV4 from './AtlasV4';
import type {TwinData} from './model';
import type {AtlasOperations} from '@/lib/atlas/model';

// Authorized on the server before compression. Keeps the full year's evidence
// without shipping repeated item/supplier names as a multi-megabyte RSC payload.
export default function AtlasPayload({data,encoded,initial}:{data:TwinData;encoded:string;initial?:Record<string,string>}){
 const {value:operations,error}=useCompressedData<AtlasOperations>(encoded);
 if(error)return <section className="p-8"><h1>Atlas</h1><p>Não foi possível abrir a leitura. Atualize a página em um navegador recente.</p></section>;
 if(!operations)return <section className="p-8" role="status"><h1>Atlas</h1><p>Preparando a visão operacional…</p></section>;
 return <AtlasV4 data={data} operations={operations} initial={initial}/>;
}
