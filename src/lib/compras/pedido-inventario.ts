export interface PosicaoEstoque {
  quantidade: number | null;
  unidade_medida: string | null;
  atualizado_em: string | null;
  empresa: number;
  deposito: number;
  nome: string;
  motivo: string | null;
}
export interface InventarioPedido {
  operacao: PosicaoEstoque | null;
  centrais: PosicaoEstoque[];
}
export interface DepositoSaldo {
  unit_id: string; empresa: number; deposito: number; nome: string;
  total: number | null; concluido_em: string | null; registros: unknown;
}
type Registro = Record<string, unknown>;
const number = (v: unknown): number | null => v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
// Empresa/depósito operacional conferidos no cadastro oficial Everest em 04/11/2026.
export const DEPOSITO_OPERACAO: Readonly<Record<number, number>> = { 1: 2, 3: 3, 5: 6, 10: 5 };

export function posicaoDoItem(depot: DepositoSaldo, item: { cd_item: string; everest_codigo: number; unidade_medida: string | null }, now: number): PosicaoEstoque {
  const rows = Array.isArray(depot.registros) ? depot.registros as Registro[] : [];
  const scoped = rows.every(r => r && typeof r === 'object' && number(r.cd_empresa) === depot.empresa && number(r.cd_deposito) === depot.deposito);
  const matches = rows.filter(r => r && String(r.cd_item) === item.cd_item && number(r.id_item) === item.everest_codigo);
  const row = matches.length === 1 ? matches[0] : undefined;
  const quantity = number(row?.qt_estoque);
  const unit = row?.sg_unidademedida == null ? null : String(row.sg_unidademedida);
  const age = now - Date.parse(depot.concluido_em ?? '');
  const motivo = !Array.isArray(depot.registros) || depot.total !== rows.length || !scoped ? 'Coleta incompleta ou escopo divergente'
    : matches.length > 1 ? 'Saldo duplicado'
    : !row ? 'Item sem leitura'
    : quantity == null ? 'Quantidade indisponível'
    : !unit || unit.trim().toUpperCase() !== item.unidade_medida?.trim().toUpperCase() ? 'Unidade divergente'
    : quantity < 0 ? 'Saldo negativo'
    : !Number.isFinite(age) || age < 0 || age > 8 * 3600000 ? 'Leitura desatualizada'
    : null;
  return { quantidade: quantity, unidade_medida: unit, atualizado_em: depot.concluido_em, empresa: depot.empresa, deposito: depot.deposito, nome: depot.nome, motivo };
}

export function estoqueParaPedido(
  item: { estoque_contado: number | null; contado_em: string | null; inventario?: InventarioPedido | null; unidade_medida: string | null },
  manual?: number,
): number | null {
  if (manual != null) return Number.isFinite(manual) && manual >= 0 ? manual : null;
  const position = item.inventario?.operacao;
  // A contagem persistida só substitui a leitura ERP se for posterior a ela.
  if (item.estoque_contado != null && item.contado_em &&
      (!position?.atualizado_em || Date.parse(item.contado_em) >= Date.parse(position.atualizado_em))) {
    return Number.isFinite(item.estoque_contado) && item.estoque_contado >= 0 ? item.estoque_contado : null;
  }
  return position && !position.motivo ? position.quantidade : null;
}
