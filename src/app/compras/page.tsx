import Link from "next/link";
import { Plus, Truck } from "lucide-react";

import { buttonVariants } from "@kph/ui/button";
import { listPurchaseOrders } from "@/app/compras/actions";
import { getCurrentUnit } from "@kph/auth/unit";
import { requireUser } from "@kph/auth/server";
import { ComprasClient } from "./compras-client";

export const dynamic = "force-dynamic";

export default async function ComprasPage() {
  await requireUser();
  const unit = await getCurrentUnit();
  const orders = await listPurchaseOrders(unit?.id ?? null);

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18,
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.6,
              textTransform: "uppercase",
              color: "var(--text-3)",
            }}
          >
            Operacional · Compras
          </div>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 700,
              margin: "6px 0 4px",
              color: "var(--text)",
              letterSpacing: -0.4,
            }}
          >
            Pedidos de Compra
          </h1>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-3)",
              margin: 0,
              lineHeight: 1.55,
              maxWidth: 720,
            }}
          >
            {unit
              ? `Pedidos da unidade ${unit.name}.`
              : "Todas as unidades acessíveis."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href="/compras/fornecedores"
            className={buttonVariants({ variant: "outline" })}
          >
            <Truck className="mr-2 h-4 w-4" />
            Fornecedores
          </Link>
          <Link href="/compras/novo" className={buttonVariants()}>
            <Plus className="mr-2 h-4 w-4" />
            Novo pedido
          </Link>
        </div>
      </header>

      <ComprasClient orders={orders} />
    </div>
  );
}
