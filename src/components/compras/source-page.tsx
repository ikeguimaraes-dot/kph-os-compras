import { comprasAccess } from "@/lib/compras/everest-access";
import type { SourceKind } from "@/lib/compras/everest-actions";
import SourceClient from "./source-client";
export default async function SourcePage({
  kind,
  initialId,
}: {
  kind: SourceKind;
  initialId?: string;
}) {
  const { units } = await comprasAccess();
  return <SourceClient kind={kind} units={units} initialId={initialId} />;
}
