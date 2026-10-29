import { PosicaoSection } from "@/app/compras/posicao-section";
import Pulso86Client from "./pulso-86-client";
import { comprasAccess } from "@/lib/compras/everest-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export default async function Page() {
  await comprasAccess();
  return <><PosicaoSection /><Pulso86Client /></>;
}
