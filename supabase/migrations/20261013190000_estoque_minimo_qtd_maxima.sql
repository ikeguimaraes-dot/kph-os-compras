-- Adiciona estoque máximo à tabela de controle de estoque mínimo.
-- Quando definido, a sugestão de pedido não ultrapassará qtd_maxima.

ALTER TABLE public.compras_estoque_minimo
  ADD COLUMN IF NOT EXISTS qtd_maxima numeric;

COMMENT ON COLUMN public.compras_estoque_minimo.qtd_maxima IS
  'Estoque máximo alvo. Quando definido, sugestão de pedido não ultrapassa este valor.';
