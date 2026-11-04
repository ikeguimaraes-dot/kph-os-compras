import {getFluxo} from '@/lib/compras/fluxo-actions';
import FlowClient from './fluxo-client';
import '../operacao/operacao.css';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{modo?:string}>}){
 const q=await searchParams;
 return <FlowClient initial={await getFluxo(q.modo==='real'?'real':'teste')}/>;
}
