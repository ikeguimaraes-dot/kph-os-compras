import { getCurrentUnit } from "@kph/auth/unit";
import { requireUser } from "@kph/auth/server";
import { getSugestoesReposicao } from "@/lib/compras/pedidos-sugestoes-actions";
import { getPedidoSugeridoDoMes } from "@/lib/compras/pedido-sugerido-actions";
import { PedidosSugestoesClient } from "./pedidos-sugestoes-client";
import { PedidoSugeridoClient } from "./pedido-sugerido-client";
import Link from "next/link";
import { Suspense } from "react";
import { unstable_rethrow } from "next/navigation";
import { PedidoCasaSelector, PedidoRetry } from "./pedido-casa-selector";

export const dynamic = "force-dynamic";

export default async function PedidosSugestoesPage() {
  await requireUser();
  const unit = await getCurrentUnit();

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
          Pedido automático
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

      <PedidoCasaSelector />

      {unit && (
        <>
          <p style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 8, marginBottom: 24 }}>
            <Link href="/compras" style={{ fontWeight: 600, textDecoration: "underline" }}>Abrir planejamento pelas vendas · 4, 8 e 12 semanas →</Link>
          </p>
          <Suspense key={`pedido:${unit.id}`} fallback={<p role="status">Carregando pedido sugerido por fornecedor…</p>}>
            <PedidoSection unitId={unit.id} />
          </Suspense>
          <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "8px 0 32px" }} />
          <Suspense key={`reposicao:${unit.id}`} fallback={<p role="status">Conferindo sugestões de reposição…</p>}>
            <ReposicaoSection unitId={unit.id} unitName={unit.name} />
          </Suspense>
        </>
      )}
    </div>
  );
}

async function PedidoSection({ unitId }: { unitId: string }) {
  let pedido;
  try {
    pedido = await getPedidoSugeridoDoMes(unitId);
  } catch (error) {
    unstable_rethrow(error);
    console.error("[compras:pedido-sugerido]", { unitId, error });
    return <SectionError title="Pedido sugerido indisponível" />;
  }
  return <PedidoSugeridoClient pedido={pedido} unitId={unitId} />;
}

async function ReposicaoSection({ unitId, unitName }: { unitId: string; unitName: string }) {
  let sugestoes;
  try {
    sugestoes = await getSugestoesReposicao(unitId);
  } catch (error) {
    unstable_rethrow(error);
    console.error("[compras:reposicao]", { unitId, error });
    return <SectionError title="Sugestões de reposição indisponíveis" />;
  }
  return <PedidosSugestoesClient sugestoes={sugestoes} unitName={unitName} unitId={unitId} />;
}

function SectionError({ title }: { title: string }) {
  return <section role="alert" style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 8, marginBottom: 24 }}>
    <h2>{title}</h2>
    <p>Não foi possível carregar esta lista. Isso não significa que não há itens para comprar.</p>
    <PedidoRetry />
    {" · "}<Link href="/compras">Abrir planejamento pelas vendas</Link>
  </section>;
}
