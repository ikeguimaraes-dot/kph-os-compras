import { listSuppliers } from "@/app/compras/actions";
import { getCurrentUnit } from "@kph/auth/unit";
import { requireUser } from "@kph/auth/server";
import { NovoCompraClient } from "./novo-compra-client";
import { getPedidoSuppliers } from "@/lib/compras/pedidos-actions";
import { Newsreader, Instrument_Sans } from "next/font/google";
import "../prisma/prisma.css";
import "./pedidos.css";
const serif = Newsreader({ subsets: ["latin"], variable: "--prisma-serif" });
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--prisma-sans" });

export const dynamic = "force-dynamic";

export default async function NovoPedidoPage() {
  await requireUser();
  const unit = await getCurrentUnit();
  if (!unit || !unit.brand_id) {
    return (
      <p role="status">
        Selecione uma casa no menu para criar o pedido de compra.
      </p>
    );
  }
  const [suppliers, groups] = await Promise.all([listSuppliers(unit.id), getPedidoSuppliers(unit.id)]);
  return (
    <div className={`${serif.variable} ${sans.variable}`}>
      <NovoCompraClient
        unitId={unit.id}
        unitName={unit.name}
        brandId={unit.brand_id}
        suppliers={suppliers}
        groups={groups}
      />
    </div>
  );
}
