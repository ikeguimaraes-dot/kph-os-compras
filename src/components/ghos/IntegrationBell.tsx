'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Bell} from 'lucide-react';
import {getIntegrationWatches} from '@/lib/integracao-watch/actions';
export function IntegrationBell(){
 const [count,setCount]=useState(0);
 useEffect(()=>{let live=true;const refresh=async()=>{if(document.hidden)return;try{const rows=await getIntegrationWatches();if(live)setCount(rows.filter(r=>r.status==='found').length);}catch{/* A página de avisos expõe falhas; o cabeçalho não interrompe a navegação. */}};
 void refresh();const timer=setInterval(()=>void refresh(),60000);return()=>{live=false;clearInterval(timer);};},[]);
 return <Link href="/compras/avisos" className="ghos-watch-link" aria-label={`Avisos de integração${count?`: ${count} baixas encontradas`:''}`}><Bell size={18}/><span>Avisos{count>0?` · ${count}`:''}</span></Link>;
}
