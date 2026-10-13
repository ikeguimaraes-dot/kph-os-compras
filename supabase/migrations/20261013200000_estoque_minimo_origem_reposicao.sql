-- Adiciona origem de reposição e fornecedor preferencial à tabela compras_estoque_minimo.
-- origem_reposicao determina como o item é reposto: compra externa, transferência entre casas,
-- produção interna (ex.: cozinha Dacio) ou bloqueado (não gera sugestão de reposição).

ALTER TABLE public.compras_estoque_minimo
  ADD COLUMN IF NOT EXISTS origem_reposicao text NOT NULL DEFAULT 'compra'
    CHECK (origem_reposicao IN ('compra', 'transferencia', 'producao', 'bloqueado'));

ALTER TABLE public.compras_estoque_minimo
  ADD COLUMN IF NOT EXISTS fornecedor_preferencial_id uuid
    REFERENCES public.everest_fornecedores(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.compras_estoque_minimo.origem_reposicao IS
  'Como o item é reposto: compra=pedido a fornecedor, transferencia=transferência entre casas, producao=cozinha de produção (ex.: Dacio), bloqueado=sem sugestão de reposição.';

COMMENT ON COLUMN public.compras_estoque_minimo.fornecedor_preferencial_id IS
  'Fornecedor Everest preferencial para reposição deste item. Apenas informativo; não bloqueia outros fornecedores.';
