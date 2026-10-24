import Link from "next/link";
import { comprasAccess } from "@/lib/compras/everest-access";
import EstoqueTabs from "./estoque-tabs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function Page() {
  const { units } = await comprasAccess();
  return <><Link href="/compras/estoque/everest">Consultar saldo por depósito no Everest →</Link><EstoqueTabs units={units} /></>;
}
