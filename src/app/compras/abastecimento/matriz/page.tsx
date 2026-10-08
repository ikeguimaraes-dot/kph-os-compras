import MatrixClient from "./matrix-client";
import { comprasAccess } from "@/lib/compras/everest-access";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export default async function Page() {
  await comprasAccess();
  return <MatrixClient />;
}
