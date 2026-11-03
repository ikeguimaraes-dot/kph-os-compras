import SourcePage from "@/components/compras/source-page";
import {getRecebimentoOperacional} from '@/lib/compras/recebimento-actions';
import RecebimentoClient from './recebimento-client';
import '../operacao/operacao.css';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<{pedido?:string}>}){const {pedido}=await searchParams;return <><RecebimentoClient pedido={pedido} initial={await getRecebimentoOperacional()}/><details className="op-page"><summary>Consultar notas recebidas no Everest</summary><SourcePage kind="recebimento"/></details></>;}
