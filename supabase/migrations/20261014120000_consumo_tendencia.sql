-- Prompt 16. Pedido Sugerido do Mês: mv_consumo_tendencia + compras_contagem_rapida + cron.
-- Reads: v_compra_cmv_base (notas 90d/ant), lorean_workdays + lorean_produtos_dia (vendas),
--        produto_venda_ficha (status confirmado) + v_ficha_explodida (ingredientes).
-- No source table is modified.

CREATE MATERIALIZED VIEW public.mv_consumo_tendencia AS
WITH
  -- Actual purchases: 90d current window and 90-180d prior window, per unit+ingredient.
  -- Division by 13 converts 90-day total to a weekly average.
  compra AS (
    SELECT
      unit_id,
      item_id                                                                                           AS insumo_id,
      COALESCE(SUM(quantidade) FILTER (WHERE data >= current_date - 90), 0)                  / 13.0   AS qty_atual,
      COALESCE(SUM(quantidade) FILTER (WHERE data >= current_date - 180
                                         AND data <  current_date - 90),  0)                 / 13.0   AS qty_ant
    FROM public.v_compra_cmv_base
    WHERE data  >= current_date - 180
      AND data  <  current_date
      AND item_id  IS NOT NULL
      AND quantidade IS NOT NULL
      AND quantidade >  0
    GROUP BY unit_id, item_id
  ),
  -- Aggregate Lorean sales per unit + product name (normalised), both windows.
  lorean_agg AS (
    SELECT
      w.unit_id,
      upper(public.unaccent(trim(p.produto)))                                                          AS nome_venda,
      COALESCE(SUM(p.qtd) FILTER (WHERE w.data >= current_date - 90),                         0)      AS qtd_atual,
      COALESCE(SUM(p.qtd) FILTER (WHERE w.data >= current_date - 180
                                    AND w.data <  current_date - 90),                          0)      AS qtd_ant
    FROM public.lorean_workdays w
    JOIN public.lorean_produtos_dia p ON p.workday_id_fk = w.id
    WHERE w.data >= current_date - 180 AND w.data < current_date
    GROUP BY w.unit_id, upper(public.unaccent(trim(p.produto)))
  ),
  -- Theoretical consumption: Lorean sales × ficha ingredient quantities.
  -- Only confirmed fichas (status = 'confirmado') are included.
  teorico AS (
    SELECT
      pvf.unit_id,
      fe.insumo_id,
      COALESCE(SUM(la.qtd_atual * fe.quantidade), 0) / 13.0   AS qty_atual,
      COALESCE(SUM(la.qtd_ant  * fe.quantidade), 0) / 13.0    AS qty_ant
    FROM lorean_agg la
    JOIN public.produto_venda_ficha pvf
      ON  pvf.unit_id   = la.unit_id
      AND pvf.nome_venda = la.nome_venda
      AND pvf.status    = 'confirmado'
    JOIN public.v_ficha_explodida fe
      ON  fe.unit_id  = pvf.unit_id
      AND fe.ficha_id = pvf.ficha_id
    GROUP BY pvf.unit_id, fe.insumo_id
  ),
  -- All (unit_id, insumo_id) pairs that appear in either source.
  all_pairs AS (
    SELECT unit_id, insumo_id FROM compra
    UNION
    SELECT unit_id, insumo_id FROM teorico
  )
SELECT
  ap.unit_id,
  ap.insumo_id,
  COALESCE(c.qty_atual,  0)                                                              AS consumo_sem_compra,
  COALESCE(te.qty_atual, 0)                                                              AS consumo_sem_teorico,
  GREATEST(COALESCE(c.qty_atual, 0), COALESCE(te.qty_atual, 0))                        AS tendencia_sem,
  CASE
    WHEN GREATEST(COALESCE(c.qty_ant, 0), COALESCE(te.qty_ant, 0)) > 0 THEN
      ROUND(
        ( GREATEST(COALESCE(c.qty_atual, 0), COALESCE(te.qty_atual, 0))
        / GREATEST(COALESCE(c.qty_ant,   0), COALESCE(te.qty_ant,   0))
        - 1.0 ) * 100,
        1
      )
    ELSE NULL
  END                                                                                    AS variacao_pct
FROM all_pairs ap
LEFT JOIN compra  c  USING (unit_id, insumo_id)
LEFT JOIN teorico te USING (unit_id, insumo_id)
WHERE GREATEST(COALESCE(c.qty_atual, 0), COALESCE(te.qty_atual, 0)) > 0
WITH NO DATA;

-- Unique index enables REFRESH CONCURRENTLY.
CREATE UNIQUE INDEX mv_consumo_tendencia_pk ON public.mv_consumo_tendencia (unit_id, insumo_id);

-- Indexes for per-unit filtering used by server actions.
CREATE INDEX mv_consumo_tendencia_unit ON public.mv_consumo_tendencia (unit_id);

-- Quick stock count: persists counts entered by the user on the suggestions page.
-- Rows are upserted on input; oldest entry per (unit, ingredient) wins.
CREATE TABLE public.compras_contagem_rapida (
  unit_id    uuid        NOT NULL REFERENCES public.units(id)         ON DELETE CASCADE,
  insumo_id  uuid        NOT NULL REFERENCES public.everest_itens(id) ON DELETE CASCADE,
  qtd        numeric     NOT NULL CHECK (qtd >= 0),
  contado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (unit_id, insumo_id)
);
ALTER TABLE public.compras_contagem_rapida ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.compras_contagem_rapida FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.compras_contagem_rapida TO   service_role;
CREATE POLICY contagem_servico ON public.compras_contagem_rapida
  TO service_role USING (true) WITH CHECK (true);

-- Wrapper called by pg_cron and by the deploy migration itself.
CREATE FUNCTION public.atualizar_consumo_tendencia() RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE log_id bigint;
BEGIN
  INSERT INTO public.prisma_refresh_log(etapa) VALUES ('consumo_tendencia') RETURNING id INTO log_id;
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_consumo_tendencia;
    UPDATE public.prisma_refresh_log SET concluido_em = now() WHERE id = log_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.prisma_refresh_log SET concluido_em = now(), erro = SQLERRM WHERE id = log_id;
  END;
END $$;
REVOKE ALL ON FUNCTION public.atualizar_consumo_tendencia() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.atualizar_consumo_tendencia() TO service_role;

-- Permissions mirror the rest of the compras read layer.
REVOKE ALL ON public.mv_consumo_tendencia FROM PUBLIC, anon, authenticated;
GRANT  SELECT ON public.mv_consumo_tendencia TO service_role;

-- Monthly refresh: 1st of each month at 11:05 UTC (after Lorean/Everest ingestion window).
SELECT cron.schedule(
  'compras-tendencia-refresh-mensal',
  '5 11 1 * *',
  'SELECT public.atualizar_consumo_tendencia()'
);

-- Populate immediately on deploy (first run cannot use CONCURRENTLY — view is empty).
REFRESH MATERIALIZED VIEW public.mv_consumo_tendencia;

NOTIFY pgrst, 'reload schema';
