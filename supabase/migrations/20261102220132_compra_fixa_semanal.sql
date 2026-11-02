ALTER TABLE public.compras_estoque_minimo
  ADD COLUMN compra_fixa_semanal numeric(14,3)
  CHECK (compra_fixa_semanal IS NULL OR (compra_fixa_semanal > 0 AND compra_fixa_semanal < 1000000000));
COMMENT ON COLUMN public.compras_estoque_minimo.compra_fixa_semanal IS
  'Quantidade fixa por semana na unidade-base do insumo. NULL usa sugestão calculada. Compra fixa não desconta estoque nem aplica limites de estoque; não emite pedido automaticamente.';
