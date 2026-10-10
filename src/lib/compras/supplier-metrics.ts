import type { MapSupplier } from "./prisma-mapa";

/** Annual supplier totals, independent of the flow's category/week filters. */
export function supplierMetrics(supplier: MapSupplier | undefined) {
  const spend = supplier?.gasto_12m == null ? null : Number(supplier.gasto_12m);
  const revenue = supplier?.receita_atribuida == null ? null : Number(supplier.receita_atribuida);
  const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const leverage = spend !== null && spend > 0 && revenue !== null ? revenue / spend : null;
  return [
    {
      label: spend === null ? "Compra: sem base" : `Compra: ${money(spend)}/ano`,
      source: "Compra = gasto_12m: soma das compras CMV Everest nos últimos 12 meses, do grupo fornecedor nas casas selecionadas. Fonte: v_mapa_fornecedor. Não muda com os filtros de categoria, 86 ou média semanal do fluxo.",
    },
    {
      label: revenue === null ? "Sustenta: sem base" : `Sustenta: ${money(revenue)} de venda`,
      source: "Sustenta = receita_atribuida: receita Lorean de 12 meses rateada pelo peso do insumo no custo da ficha e pela participação do fornecedor nas compras. Fonte: v_mapa_fornecedor, nas casas selecionadas. Prévia da base calculável; pratos sem custo completo ficam de fora. Não é lucro nem a receita integral de cada prato.",
    },
    {
      label: leverage === null ? "Alavanca: sem base" : `Alavanca: ${leverage.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x`,
      source: "Alavanca = Sustenta ÷ Compra (receita_atribuida ÷ gasto_12m), usando as mesmas casas e janela de 12 meses. Indica venda atribuída por real comprado; não é margem. Compra zero ou dado ausente: sem base para divisão.",
    },
  ];
}
