import { comprasAccess } from "@/lib/compras/everest-access";
import EstoqueMinimoClient from "./minimo-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export default async function Page() {
  await comprasAccess();
  return <EstoqueMinimoClient />;
}
