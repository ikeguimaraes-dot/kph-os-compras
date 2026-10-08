import SourcePage from "@/components/compras/source-page";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <SourcePage kind="cardapio" initialId={id}/>;}
