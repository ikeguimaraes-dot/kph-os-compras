export interface InventarioPedido {
  quantidade: number | null;
  posicao_de: string | null;
  posicao_ate: string | null;
  unidade_medida: string | null;
}

export function estoqueParaPedido(
  item: { estoque_contado: number | null; contado_em: string | null; inventario?: InventarioPedido | null; unidade_medida: string | null },
  manual?: number,
): number | null {
  if (manual != null) return manual;
  const inv = item.inventario;
  const diaContagem = item.contado_em
    ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date(item.contado_em))
    : null;
  if (item.estoque_contado != null && (!inv?.posicao_ate || (diaContagem && diaContagem >= inv.posicao_ate))) {
    return item.estoque_contado;
  }
  if (inv?.quantidade == null || !Number.isFinite(inv.quantidade) || inv.quantidade < 0) return null;
  const unidade = (s: string | null) => s?.trim().toUpperCase();
  if (!unidade(item.unidade_medida) || unidade(inv.unidade_medida) !== unidade(item.unidade_medida)) return null;
  return inv.quantidade;
}
