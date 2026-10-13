import { getCurrentUnit } from "@kph/auth/unit";
import { requireUser } from "@kph/auth/server";
import { getSugestoesReposicao } from "@/lib/compras/pedidos-sugestoes-actions";
import { PedidosSugestoesClient } from "./pedidos-sugestoes-client";

export const dynamic = "force-dynamic";

export default async function PedidosSugestoesPage() {
  await requireUser();
  const unit = await getCurrentUnit();
  const sugestoes = unit
    ? await getSugestoesReposicao(unit.id)
    : { comprar: [], transferir_produzir: [] };

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
          Sugestões de Reposição
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
            ? `Itens abaixo do mínimo · ${unit.name}`
            : "Selecione uma casa para ver sugestões."}
        </p>
      </header>
      {unit && (
        <PedidosSugestoesClient sugestoes={sugestoes} unitName={unit.name} />
      )}
    </div>
  );
}
