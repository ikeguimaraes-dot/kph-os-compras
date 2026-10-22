import { getPlanejamentoVendas } from "@/lib/compras/planejamento-actions";
import { PlanejamentoClient } from "./planejamento-client";

export async function PlanejamentoSection({ unitId }: { unitId: string | null }) {
  const data = await getPlanejamentoVendas().catch(() => null);
  if (!data) return <div role="status" className="plan-notice">O planejamento pelas vendas está temporariamente indisponível. Recarregue a página para tentar novamente. Os pedidos existentes continuam abaixo.</div>;
  return <PlanejamentoClient key={unitId ?? "all"} data={data} initialUnitId={unitId} />;
}
