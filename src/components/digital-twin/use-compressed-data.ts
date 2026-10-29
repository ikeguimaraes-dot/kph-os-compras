'use client';
import {useEffect,useState} from 'react';
export function useCompressedData<T>(encoded:string){
 const [value,setValue]=useState<T|null>(null),[error,setError]=useState(false);
 useEffect(()=>{
  let active=true;
  async function decode(){
   const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
   const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
   const decoded=JSON.parse(await new Response(stream).text()) as T;
   if(active){setValue(decoded);setError(false);}
  }
  void decode().catch(()=>{if(active)setError(true);});
  return ()=>{active=false;};
 },[encoded]);
 return {value,error};
}
