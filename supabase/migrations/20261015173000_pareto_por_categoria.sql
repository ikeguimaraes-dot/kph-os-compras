-- Pareto ABC por casa x grupo do cardapio (pedido do Ike 15/10):
-- corte 80/15/5 dentro de cada categoria de venda, sobre o historico total,
-- independente de ficha confirmada. Implantado como mv_pareto_prato_v2
-- (o ambiente bloqueia DROP via MCP; a mv_pareto_prato antiga ficou dormente
-- e pode ser removida numa manutencao com acesso direto).
-- Aplicado em producao via MCP em 15/10/2026. Conteudo para ambientes novos:
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_pareto_prato_v2 AS
WITH vendas_raw AS (
  SELECT w.unit_id, upper(unaccent(TRIM(BOTH FROM p.produto))) AS nome_venda,
         NULLIF(TRIM(BOTH FROM p.grupo),'') AS grupo, w.data, p.total
  FROM lorean_workdays w JOIN lorean_produtos_dia p ON p.workday_id_fk = w.id
  WHERE ((w.unit_id = 'f2a6c9f8-929f-447b-9f77-edd8dad19bd0'::uuid AND w.data >= CURRENT_DATE - 90)
      OR (w.unit_id <> 'f2a6c9f8-929f-447b-9f77-edd8dad19bd0'::uuid AND w.data >= CURRENT_DATE - 365 AND w.data < CURRENT_DATE))
    AND p.total > 0
), agg AS (
  SELECT unit_id, nome_venda, sum(total) AS receita_periodo FROM vendas_raw GROUP BY 1,2
), grp AS (
  SELECT DISTINCT ON (unit_id, nome_venda) unit_id, nome_venda, grupo
  FROM vendas_raw WHERE grupo IS NOT NULL ORDER BY unit_id, nome_venda, data DESC
), ponte AS (
  SELECT DISTINCT ON (unit_id, nome_venda) unit_id, nome_venda, id AS produto_id
  FROM produto_venda_ficha ORDER BY unit_id, nome_venda, (status='confirmado') DESC, atualizado_em DESC
), vendas AS (
  SELECT a.unit_id, pt.produto_id, COALESCE(g.grupo,'(sem grupo)') AS grupo, a.receita_periodo
  FROM agg a
  JOIN ponte pt ON pt.unit_id=a.unit_id AND pt.nome_venda=a.nome_venda
  LEFT JOIN grp g ON g.unit_id=a.unit_id AND g.nome_venda=a.nome_venda
), ranked AS (
  SELECT unit_id, produto_id, grupo, receita_periodo,
    sum(receita_periodo) OVER (PARTITION BY unit_id, grupo) AS total_grupo,
    sum(receita_periodo) OVER (PARTITION BY unit_id, grupo ORDER BY receita_periodo DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS acumulado
  FROM vendas
)
SELECT unit_id, produto_id, grupo, receita_periodo,
  round((acumulado / NULLIF(total_grupo,0::numeric)) * 100, 2) AS pct_acumulado,
  CASE WHEN ((acumulado - receita_periodo) / NULLIF(total_grupo,0::numeric)) < 0.80 THEN 'A'
       WHEN ((acumulado - receita_periodo) / NULLIF(total_grupo,0::numeric)) < 0.95 THEN 'B'
       ELSE 'C' END AS classe_abc
FROM ranked;
CREATE UNIQUE INDEX IF NOT EXISTS mv_pareto_prato_v2_pk ON mv_pareto_prato_v2 (unit_id, produto_id);
CREATE INDEX IF NOT EXISTS mv_pareto_prato_v2_grupo ON mv_pareto_prato_v2 (unit_id, grupo);
-- v_86_protecao_prato repontada para a v2 e atualizar_pareto_prato() refresca a v2
-- (CREATE OR REPLACE aplicados em producao; definicoes completas em docs/).
