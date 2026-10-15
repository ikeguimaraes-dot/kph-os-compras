import { getCurrentUnit } from "@kph/auth/unit";
import { requireUser } from "@kph/auth/server";
import { getSugestoesReposicao } from "@/lib/compras/pedidos-sugestoes-actions";
import { getPedidoSugeridoDoMes } from "@/lib/compras/pedido-sugerido-actions";
import { PedidosSugestoesClient } from "./pedidos-sugestoes-client";
import { PedidoSugeridoClient } from "./pedido-sugerido-client";

export const dynamic = "force-dynamic";

export default async function PedidosSugestoesPage() {
  await requireUser();
  const unit = await getCurrentUnit();
  const [sugestoes, pedidoSugerido] = unit
    ? await Promise.all([
        getSugestoesReposicao(unit.id),
        getPedidoSugeridoDoMes(unit.id),
      ])
    : [{ comprar: [], transferir_produzir: [] }, { grupos: [], ultimo_refresh: null }];

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto" }}>
      <header style={{ marginBottom: 24 }}>
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
          Pedidos
        </h1>
        <p
          style={{
            fontSize: 12,
            color: "var(--text-3)",
            margin: 0,
            lineHeight: 1.55,
          }}
        >
          {unit
            ? `Sugestões baseadas em tendência e estoque · ${unit.name}`
            : "Selecione uma casa para ver sugestões."}
        </p>
      </header>

      {unit && (
        <>
          <PedidoSugeridoClient pedido={pedidoSugerido} unitId={unit.id} />
          <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "8px 0 32px" }} />
          <PedidosSugestoesClient sugestoes={sugestoes} unitName={unit.name} unitId={unit.id} />
        </>
      )}
    </div>
  );
}
