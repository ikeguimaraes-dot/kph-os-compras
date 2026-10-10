export type PedidoSupplier = { raiz_cnpj: string; nome: string };
export type PedidoCredit = {
  raiz_cnpj: string; limite_rs: number | null; em_aberto: number;
  vencido: number; a_vencer_7d: number; disponivel: number | null;
};
export type PedidoStock = {
  item_id: string; quantidade: number | null; unidade_medida: string | null;
  posicao_de: string; posicao_ate: string; fonte: string;
  posicoes: { deposito: string; dia: string; quantidade: number | null }[];
};
export type PedidoConsumption = {
  insumo_id: string; dow: number; consumo_medio: number | null; dias_observados: number;
  pratos: { produto_id: string; nome: string; media_vendas: number | null;
    quantidade_ficha: number; consumo: number | null }[];
};
export type PedidoItem = {
  id: string; descricao: string; unidade_medida: string | null;
  stock: PedidoStock | null; consumption: PedidoConsumption[]; desbloqueia: string[];
};
export type PedidoContext = { credit: PedidoCredit | null; items: PedidoItem[]; readAt: string };
export const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
export function saoPauloToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function creditState(limit: number | null, open: number, total = 0) {
  if (limit === null) return "unknown";
  if (open + total > limit) return "red";
  if (open + total > limit * 0.8) return "amber";
  return "green";
}
export function orderTotal(items: { quantidade: number; preco_unitario: number }[]) {
  return items.reduce((sum, i) => sum + Math.round((i.quantidade * i.preco_unitario + Number.EPSILON) * 100), 0) / 100;
}
export function suggestQuantity(item: PedidoItem, start: string, days: number, pack: number) {
  const stock = item.stock?.quantidade;
  if (!item.consumption.length) return { quantity: null, formula: "Sem ficha confirmada para este insumo." };
  if (stock == null) return { quantity: null, formula: "Estoque sem posição conhecida; sugestão indisponível." };
  if (item.stock?.unidade_medida !== item.unidade_medida)
    return { quantity: null, formula: "Unidades de estoque e consumo divergentes; confirme a conversão." };
  if (!Number.isInteger(days) || days < 1 || days > 90 || !Number.isFinite(pack) || pack <= 0)
    return { quantity: null, formula: "Informe cobertura de 1 a 90 dias e conteúdo positivo da unidade de compra." };
  const date = new Date(`${start}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return { quantity: null, formula: "Data inválida." };
  const terms: number[] = [];
  for (let i = 0; i < days; i++) {
    const dow = date.getUTCDay() || 7;
    const consumption = item.consumption.find((c) => c.dow === dow)?.consumo_medio;
    if (consumption == null) return { quantity: null, formula: "Histórico Lorean incompleto nas últimas 12 semanas." };
    terms.push(consumption);
    date.setUTCDate(date.getUTCDate() + 1);
  }
  const demand = terms.reduce((a, b) => a + b, 0);
  const quantity = Math.ceil(Math.max(0, demand - stock) / pack);
  return { quantity, formula: `${days} dias × média dos dias cobertos (${demand / days}) = ${demand} ${item.unidade_medida ?? "un."}; estoque ${stock}; máximo(0, ${demand} − ${stock}) ÷ ${pack} por unidade de compra, arredondado para cima = ${quantity}. Consumo: Σ(média Lorean × quantidade na ficha explodida confirmada). Estoque: ${item.stock?.fonte}.` };
}
