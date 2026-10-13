import { comprasAccess } from "@/lib/compras/everest-access";
import TimelineClient from "./timeline-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export default async function Page() {
  await comprasAccess();
  return <TimelineClient />;
}
