export interface PosicaoEstoque {
  quantidade: number | null;
  unidade_medida: string | null;
  atualizado_em: string | null;
  empresa: number;
  empresa_nome: string;
  deposito: number;
  nome: string;
  motivo: string | null;
  inventario_id: string | null;
  numero: number | null;
}
export interface InventarioPedido {
  operacao: PosicaoEstoque | null;
  centrais: PosicaoEstoque[];
}
export interface DepositoInventario {
  unit_id: string; empresa: number; empresa_nome: string; deposito: number; nome: string;
  inventario: { id: string; nr_inventario: number; dt_inventario: string; situacao: string } | null;
  itens: { item_id: string | null; quantidade_convertida: number | null; unidade_medida: string | null }[];
}
// Empresa/depósito operacional conferidos no cadastro oficial Everest em 04/11/2026.
export const DEPOSITO_OPERACAO: Readonly<Record<number, number>> = { 1: 2, 3: 3, 5: 6, 10: 5 };

export function posicaoDoItem(depot: DepositoInventario, item: { id: string; unidade_medida: string | null }): PosicaoEstoque {
  const inventory = depot.inventario;
  const matches = depot.itens.filter(row => row.item_id === item.id);
  const row = matches.length === 1 ? matches[0] : undefined;
  const quantity = row?.quantidade_convertida ?? null;
  const unit = row?.unidade_medida ?? null;
  const motivo = !inventory || inventory.situacao !== 'ENCERRADO' ? 'Sem inventário encerrado'
    : matches.length > 1 ? 'Item duplicado no inventário'
    : !row ? 'Item ausente no último inventário encerrado'
    : quantity == null || !Number.isFinite(quantity) ? 'Quantidade indisponível'
    : !unit || unit.trim().toUpperCase() !== item.unidade_medida?.trim().toUpperCase() ? 'Unidade divergente'
    : quantity < 0 ? 'Quantidade negativa'
    : null;
  return {
    quantidade: inventory?.situacao === 'ENCERRADO' ? quantity : null,
    unidade_medida: unit, atualizado_em: inventory?.dt_inventario ?? null,
    empresa: depot.empresa, empresa_nome: depot.empresa_nome, deposito: depot.deposito, nome: depot.nome, motivo,
    inventario_id: inventory?.id ?? null, numero: inventory?.nr_inventario ?? null,
  };
}

export function estoqueParaPedido(item: { inventario?: InventarioPedido | null }): number | null {
  const position = item.inventario?.operacao;
  // Apenas o último inventário encerrado: saldo ERP e contagem avulsa não substituem esta fonte.
  return position && !position.motivo ? position.quantidade : null;
}
