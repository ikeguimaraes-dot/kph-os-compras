import SupplyClient from "@/app/compras/abastecimento/supply-client";
import { comprasAccess } from "@/lib/compras/everest-access";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;
export default async function Page() {
  await comprasAccess();
  return <SupplyClient mode="estrategia" />;
}
