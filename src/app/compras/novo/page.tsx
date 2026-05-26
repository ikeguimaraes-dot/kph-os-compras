import { redirect } from "next/navigation";
import {
  listSuppliers,
} from "@/app/compras/actions";
import { getCurrentUnit } from "@kph/auth/unit";
import { requireUser } from "@kph/auth/server";
import { NovoCompraClient } from "./novo-compra-client";

export const dynamic = "force-dynamic";

export default async function NovoPedidoPage() {
  await requireUser();
  const unit = await getCurrentUnit();
  if (!unit || !unit.brand_id) {
    // Compras exige brand_id (FK NOT NULL). Sem isso volta pra lista.
    redirect("/compras");
  }
  const suppliers = await listSuppliers(unit.id);
  return (
    <div style={{ padding: "0 4px" }}>
      <NovoCompraClient
        unitId={unit.id}
        unitName={unit.name}
        brandId={unit.brand_id}
        suppliers={suppliers}
      />
    </div>
  );
}
