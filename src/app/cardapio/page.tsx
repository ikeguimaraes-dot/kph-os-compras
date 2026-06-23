import { getCurrentUnit } from "@kph/auth/unit";
import { listMenuItems } from "@/lib/compras/menu-item-actions";
import { CardapioClient } from "./cardapio-client";

export const dynamic = "force-dynamic";

export default async function CardapioPage() {
  const [items, unit] = await Promise.all([listMenuItems(), getCurrentUnit()]);

  return (
    <CardapioClient
      items={items}
      currentUnitId={unit?.id ?? null}
      currentUnitName={unit?.name ?? null}
    />
  );
}
