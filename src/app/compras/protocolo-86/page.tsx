import { PosicaoSection } from "@/app/compras/posicao-section";
import Protocolo86Client from "./protocolo-86-client";
import { comprasAccess } from "@/lib/compras/everest-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export default async function Page() {
  await comprasAccess();
  return <><PosicaoSection /><Protocolo86Client /></>;
}
