-- Preserve unknown dependencies. Purchase prices retain the existing 90d/12m
-- policy; only missing/nonpositive prices use the last positive Everest cost
-- for the SAME item and house, never a future accounting month.
-- A partial recipe has no known denominator: do not normalize only priced
-- ingredients, or turn unknown revenue/weight into zero.
CREATE OR REPLACE VIEW public.v_mapa_aresta_calc WITH (security_invoker = true) AS
WITH historico AS MATERIALIZED (
  SELECT DISTINCT ON (h.unit_id, h.item_id)
    h.unit_id, h.item_id, h.vl_custo_medio
  FROM public.everest_itens_custo_historico h
  WHERE h.vl_custo_medio > 0
    AND h.mes BETWEEN 1 AND 12
    AND (h.ano, h.mes) <= (extract(year FROM CURRENT_DATE)::int, extract(month FROM CURRENT_DATE)::int)
  ORDER BY h.unit_id, h.item_id, h.ano DESC, h.mes DESC,
    h.snapshot_em DESC NULLS LAST, h.atualizado_em DESC NULLS LAST, h.id DESC
), precos AS MATERIALIZED (
  SELECT f.*, COALESCE(CASE WHEN p.preco_medio > 0 THEN p.preco_medio END, h.vl_custo_medio) AS preco_unitario,
    CASE WHEN p.preco_medio > 0 THEN 'compra'
         WHEN h.vl_custo_medio > 0 THEN 'historico'
         ELSE 'sem_preco' END AS fonte_preco
  FROM public.v_ficha_explodida f
  LEFT JOIN public.v_preco_medio_compra p ON p.unit_id = f.unit_id AND p.item_id = f.insumo_id
  LEFT JOIN historico h ON h.unit_id = f.unit_id AND h.item_id = f.insumo_id
), custos AS MATERIALIZED (
  SELECT p.*, quantidade * preco_unitario AS custo,
    sum(quantidade * preco_unitario) OVER ficha AS custo_total,
    bool_and(COALESCE(preco_unitario > 0 AND quantidade >= 0, false)) OVER ficha AS custo_completo
  FROM precos p
  WINDOW ficha AS (PARTITION BY unit_id, ficha_id)
), pesos AS MATERIALIZED (
  SELECT c.*, CASE WHEN custo_completo AND custo_total > 0 THEN custo / custo_total END AS peso_custo
  FROM custos c
)
SELECT b.unit_id, s.raiz_cnpj, c.insumo_id, b.id AS produto_venda_ficha_id,
  b.nome_venda_original AS prato, b.receita_12m,
  b.receita_12m / ((CURRENT_DATE - (CURRENT_DATE - interval '1 year')::date)::numeric / 7) AS receita_semana,
  c.peso_custo, s.share_12m AS share_fornecedor,
  b.receita_12m * c.peso_custo * s.share_12m AS receita_atribuida,
  c.peso_custo >= 0.15 AS critico,
  COALESCE(i.nome, item.descricao, c.insumo_id::text) AS insumo,
  COALESCE(i.categoria, item.grupo) AS categoria,
  COALESCE(i.reserva, 0::bigint) AS reserva,
  i.ultima_compra, i.principal_90d, i.principal_12m, COALESCE(i.fornecedor_trocou, false) AS fornecedor_trocou,
  c.preco_unitario, c.fonte_preco, c.custo_completo
FROM public.produto_venda_ficha b
JOIN pesos c ON c.unit_id = b.unit_id AND c.ficha_id = b.ficha_id
-- Missing purchases also mean no supplier share/insumo row. LEFT JOIN is
-- essential: an unpriced ingredient must not disappear at this stage either.
LEFT JOIN public.v_mapa_share s ON s.unit_id = c.unit_id AND s.item_id = c.insumo_id
LEFT JOIN public.v_mapa_insumo i ON i.unit_id = c.unit_id AND i.insumo_id = c.insumo_id
LEFT JOIN public.everest_itens item ON item.id = c.insumo_id
WHERE b.status = 'confirmado' AND b.receita_12m > 0;

-- Swap the materialization without dropping its public dependent views/ACLs.
-- No CASCADE: an unexpected dependency aborts the migration transaction.
ALTER MATERIALIZED VIEW public.mv_mapa_aresta RENAME TO mv_mapa_aresta_anterior;
CREATE MATERIALIZED VIEW public.mv_mapa_aresta AS
SELECT * FROM public.v_mapa_aresta_calc WITH NO DATA;
REVOKE ALL ON public.mv_mapa_aresta FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mv_mapa_aresta TO service_role;
REFRESH MATERIALIZED VIEW public.mv_mapa_aresta;
CREATE OR REPLACE VIEW public.v_mapa_aresta AS SELECT * FROM public.mv_mapa_aresta;
DROP MATERIALIZED VIEW public.mv_mapa_aresta_anterior;
CREATE INDEX mv_mapa_aresta_unit_forn_idx ON public.mv_mapa_aresta (unit_id, raiz_cnpj);
CREATE INDEX mv_mapa_aresta_prato_idx ON public.mv_mapa_aresta (unit_id, produto_venda_ficha_id);
COMMENT ON VIEW public.v_mapa_aresta_calc IS 'Compra (política 90d/12m), último custo histórico positivo da mesma casa, ou sem preço. Ficha incompleta conserva arestas com peso e receita atribuída nulos.';
NOTIFY pgrst, 'reload schema';
