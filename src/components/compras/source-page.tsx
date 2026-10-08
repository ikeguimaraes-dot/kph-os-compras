import { comprasAccess } from "@/lib/compras/everest-access";
import { getCurrentUnit } from "@kph/auth/unit";
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
  const current = await getCurrentUnit();
  return (
    <SourceClient
      kind={kind}
      units={units}
      initialUnit={
        units.some((u) => u.id === current?.id) ? current!.id : units[0]!.id
      }
      initialId={initialId}
    />
  );
}
