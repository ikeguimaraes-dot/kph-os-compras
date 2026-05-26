import { redirect } from "next/navigation";
import { listSuppliers } from "@/app/compras/actions";
import { getCurrentUnit } from "@kph/auth/unit";
import { requireUser } from "@kph/auth/server";
import { FornecedoresClient } from "./fornecedores-client";

export const dynamic = "force-dynamic";

export default async function FornecedoresPage() {
  await requireUser();
  const unit = await getCurrentUnit();
  if (!unit || !unit.brand_id) redirect("/compras");
  const suppliers = await listSuppliers(unit.id);
  return (
    <FornecedoresClient
      unitId={unit.id}
      unitName={unit.name}
      brandId={unit.brand_id}
      suppliers={suppliers}
    />
  );
}
