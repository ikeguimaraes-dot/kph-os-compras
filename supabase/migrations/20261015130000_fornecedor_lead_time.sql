-- Prompt 18/18b: lead_time_dias para cálculo do ponto de pedido.
-- ponto_pedido = qtd_minima + (tendencia_sem/7) × lead_time_dias.
ALTER TABLE public.compras_fornecedor_credito
  ADD COLUMN IF NOT EXISTS lead_time_dias int NOT NULL DEFAULT 3
    CHECK (lead_time_dias BETWEEN 1 AND 90);

COMMENT ON COLUMN public.compras_fornecedor_credito.lead_time_dias IS
  'Prazo de entrega em dias corridos. Ponto de pedido = qtd_minima + (consumo_dia × lead_time_dias).';

NOTIFY pgrst, 'reload schema';
