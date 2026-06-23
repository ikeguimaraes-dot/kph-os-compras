// Tipos do módulo Cardápio / Fichas Técnicas.
// menu_items ganhou (migration 029): codigo, rendimento, is_subproduto.
// NUMERIC do Postgres vem como number aqui (a tabela já é tipada em database.ts).

export interface MenuItemFicha {
  id: string;
  brand_id: string;
  unit_id: string | null;
  codigo: string | null;
  nome: string;
  categoria: string;
  preco_venda: number;
  custo_total: number | null;
  cmv_pct: number | null;
  rendimento: number;
  is_subproduto: boolean;
  tem_ficha_tecnica: boolean;
  ativo: boolean;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

// Categorias de cardápio que o usuário define à mão (preço/categorização).
export const MENU_CATEGORIAS = [
  "entrada",
  "prato_principal",
  "sobremesa",
  "bar",
  "cozinha",
  "bebida_alcoolica",
  "bebida_nao_alcoolica",
  "outros",
] as const;

export type MenuCategoria = (typeof MENU_CATEGORIAS)[number];

export const MENU_CATEGORIA_LABELS: Record<string, string> = {
  entrada: "Entrada",
  prato_principal: "Prato Principal",
  sobremesa: "Sobremesa",
  bar: "Bar",
  cozinha: "Cozinha",
  bebida_alcoolica: "Bebida Alcoólica",
  bebida_nao_alcoolica: "Bebida Não Alcoólica",
  outros: "Outros",
};

// CMV % a partir de custo e preço. Retorna null quando não há preço de venda.
export function cmvPct(custo: number | null, preco: number | null): number | null {
  if (!preco || preco <= 0) return null;
  return ((custo ?? 0) / preco) * 100;
}
