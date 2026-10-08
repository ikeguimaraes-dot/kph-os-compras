import { getPonteUnits } from "./actions";
import PonteClient from "./ponte-client";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function PontePage() {
  const units = await getPonteUnits();
  return <PonteClient units={units} />;
}
