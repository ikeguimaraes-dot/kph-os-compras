-- supabase/migrations/20261015120000_protocolo_86.sql
-- Protocolo 86: tabelas de decisão (IF NOT EXISTS para deploy fresh),
-- mv_pareto_prato (ABC via Lorean), v_86_episodio_mes (adaptador do v_86_episodio
-- existente), v_86_protecao_prato, v_86_heranca_insumo, cron mensal e refresh.
-- NOTA: compras_86_prato.prato é TEXT (= pvf.nome_venda), não uuid.
BEGIN;

-- ─── 1. Tabelas de decisão (idempotente — podem já existir em prod) ────────

CREATE TABLE IF NOT EXISTS public.compras_86_categoria (
  unit_id             uuid    NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  grupo               text    NOT NULL,
  teto_86_simultaneo  int     NOT NULL DEFAULT 1,
  critica             boolean NOT NULL DEFAULT false,
  PRIMARY KEY (unit_id, grupo)
);
ALTER TABLE public.compras_86_categoria ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'compras_86_categoria' AND policyname = 'cat_servico'
  ) THEN
    REVOKE ALL ON public.compras_86_categoria FROM anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.compras_86_categoria TO service_role;
  END IF;
END $$;

-- prato é TEXT (= pvf.nome_venda), não uuid — join via nome_venda.
CREATE TABLE IF NOT EXISTS public.compras_86_prato (
  unit_id     uuid    NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  prato       text    NOT NULL,
  assinatura  boolean NOT NULL DEFAULT false,
  observacao  text,
  PRIMARY KEY (unit_id, prato)
);
ALTER TABLE public.compras_86_prato ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'compras_86_prato' AND policyname = 'prato_servico'
  ) THEN
    REVOKE ALL ON public.compras_86_prato FROM anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.compras_86_prato TO service_role;
  END IF;
END $$;

-- ─── 2. mv_pareto_prato: ABC via receita Lorean, janela por casa ───────────
-- Frêneze (f2a6c9f8-929f-447b-9f77-edd8dad19bd0) usa 90 dias; demais 365.
-- Classe: A = acumulado até 80 %, B até 95 %, C resto.

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_pareto_prato AS
WITH janela AS (
  SELECT
    w.unit_id,
    upper(public.unaccent(trim(p.produto))) AS nome_venda,
    SUM(p.total)                            AS receita_periodo
  FROM public.lorean_workdays w
  JOIN public.lorean_produtos_dia p ON p.workday_id_fk = w.id
  WHERE (
      w.unit_id =  'f2a6c9f8-929f-447b-9f77-edd8dad19bd0'::uuid
      AND w.data >= current_date - 90
    ) OR (
      w.unit_id <> 'f2a6c9f8-929f-447b-9f77-edd8dad19bd0'::uuid
      AND w.data >= current_date - 365
    )
  AND w.data < current_date
  GROUP BY w.unit_id, upper(public.unaccent(trim(p.produto)))
),
vendas AS (
  SELECT j.unit_id, pvf.id AS produto_id, j.receita_periodo
  FROM janela j
  JOIN public.produto_venda_ficha pvf
    ON  pvf.unit_id   = j.unit_id
    AND pvf.nome_venda = j.nome_venda
    AND pvf.status    = 'confirmado'
),
ranked AS (
  SELECT
    unit_id,
    produto_id,
    receita_periodo,
    SUM(receita_periodo) OVER (PARTITION BY unit_id)              AS total_unit,
    SUM(receita_periodo) OVER (
      PARTITION BY unit_id ORDER BY receita_periodo DESC
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )                                                             AS acumulado
  FROM vendas
)
SELECT
  unit_id,
  produto_id,
  receita_periodo,
  ROUND(acumulado / NULLIF(total_unit, 0) * 100, 2) AS pct_acumulado,
  CASE
    WHEN (acumulado - receita_periodo) / NULLIF(total_unit, 0) < 0.80 THEN 'A'
    WHEN (acumulado - receita_periodo) / NULLIF(total_unit, 0) < 0.95 THEN 'B'
    ELSE 'C'
  END                                                AS classe_abc
FROM ranked
WITH NO DATA;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='mv_pareto_prato_pk'
  ) THEN
    CREATE UNIQUE INDEX mv_pareto_prato_pk   ON public.mv_pareto_prato (unit_id, produto_id);
    CREATE INDEX        mv_pareto_prato_unit ON public.mv_pareto_prato (unit_id);
  END IF;
END $$;

REVOKE ALL   ON public.mv_pareto_prato FROM PUBLIC, anon, authenticated;
GRANT  SELECT ON public.mv_pareto_prato TO   service_role;

-- ─── 3. v_86_episodio_mes: adaptador do v_86_episodio existente ──────────
-- v_86_episodio já existe com schema rico. Este adaptador fornece as colunas
-- simples de que o Protocolo 86 precisa (episódio_id, produto_venda_ficha_id,
-- data_inicio, mes_episodio, aberto, dias_em_falta).

CREATE OR REPLACE VIEW public.v_86_episodio_mes
  WITH (security_invoker = true) AS
SELECT
  unit_id,
  produto_id || '-' || ep_num::text     AS episodio_id,
  produto_id                            AS produto_venda_ficha_id,
  entrada_data                          AS data_inicio,
  date_trunc('month', entrada_data)::date AS mes_episodio,
  saida_at IS NULL                      AS aberto,
  GREATEST(dias_em_86, 1)               AS dias_em_falta
FROM public.v_86_episodio;

REVOKE ALL   ON public.v_86_episodio_mes FROM PUBLIC, anon, authenticated;
GRANT  SELECT ON public.v_86_episodio_mes TO   service_role;

-- ─── 4. v_86_protecao_prato: classe final por prato ──────────────────────
-- compras_86_prato.prato = pvf.nome_venda (TEXT, Hipótese B)
-- INEGOCIAVEL: pareto A AND (assinatura OR teto_86_simultaneo = 0)
-- PROTEGIDO:   pareto A OR assinatura
-- GERENCIAVEL: pareto B
-- LIVRE:       pareto C (ou sem dado Lorean)

CREATE OR REPLACE VIEW public.v_86_protecao_prato
  WITH (security_invoker = true) AS
WITH grupo_recente AS (
  SELECT DISTINCT ON (pvf.unit_id, pvf.id)
    pvf.unit_id,
    pvf.id   AS produto_id,
    p.grupo
  FROM public.produto_venda_ficha pvf
  JOIN public.lorean_workdays     w  ON  w.unit_id = pvf.unit_id
  JOIN public.lorean_produtos_dia p  ON  p.workday_id_fk = w.id
                                     AND upper(public.unaccent(trim(p.produto))) = pvf.nome_venda
  WHERE p.grupo IS NOT NULL
  ORDER BY pvf.unit_id, pvf.id, w.data DESC
)
SELECT
  pvf.unit_id,
  pvf.id                                AS produto_id,
  pvf.nome_venda                        AS nome_venda_key,
  pvf.nome_venda_original               AS nome,
  pvf.receita_12m,
  COALESCE(par.classe_abc, 'C')         AS classe_abc,
  COALESCE(p86.assinatura, false)       AS assinatura,
  gr.grupo,
  cat.teto_86_simultaneo,
  COALESCE(cat.critica, false)          AS critica,
  CASE
    WHEN COALESCE(par.classe_abc, 'C') = 'A'
     AND (COALESCE(p86.assinatura, false)
          OR COALESCE(cat.teto_86_simultaneo, 1) = 0)
    THEN 'INEGOCIAVEL'
    WHEN COALESCE(par.classe_abc, 'C') = 'A'
      OR COALESCE(p86.assinatura, false)
    THEN 'PROTEGIDO'
    WHEN COALESCE(par.classe_abc, 'C') = 'B'
    THEN 'GERENCIAVEL'
    ELSE 'LIVRE'
  END                                   AS classe_86
FROM public.produto_venda_ficha pvf
LEFT JOIN public.mv_pareto_prato        par ON  par.unit_id   = pvf.unit_id
                                            AND par.produto_id = pvf.id
LEFT JOIN public.compras_86_prato       p86 ON  p86.unit_id   = pvf.unit_id
                                            AND p86.prato      = pvf.nome_venda
LEFT JOIN grupo_recente                 gr  ON  gr.unit_id    = pvf.unit_id
                                            AND gr.produto_id  = pvf.id
LEFT JOIN public.compras_86_categoria   cat ON  cat.unit_id   = pvf.unit_id
                                            AND cat.grupo      = gr.grupo
WHERE pvf.status = 'confirmado';

REVOKE ALL   ON public.v_86_protecao_prato FROM PUBLIC, anon, authenticated;
GRANT  SELECT ON public.v_86_protecao_prato TO   service_role;

-- ─── 5. v_86_heranca_insumo: classe herdada por insumo ────────────────────

CREATE OR REPLACE VIEW public.v_86_heranca_insumo
  WITH (security_invoker = true) AS
SELECT
  pvf.unit_id,
  fe.insumo_id,
  COALESCE(i.descricao, 'Item sem cadastro')    AS nome_insumo,
  COUNT(DISTINCT pvf.id)                        AS n_pratos_protegidos,
  SUM(pvf.receita_12m)                          AS receita_protegida,
  CASE
    WHEN bool_or(prot.classe_86 = 'INEGOCIAVEL') THEN 'INEGOCIAVEL'
    ELSE 'PROTEGIDO'
  END                                           AS classe_herdada
FROM public.v_86_protecao_prato       prot
JOIN public.produto_venda_ficha       pvf  ON  pvf.unit_id = prot.unit_id
                                           AND pvf.id       = prot.produto_id
JOIN public.v_ficha_explodida         fe   ON  fe.unit_id  = pvf.unit_id
                                           AND fe.ficha_id  = pvf.ficha_id
LEFT JOIN public.everest_itens        i    ON  i.id        = fe.insumo_id
WHERE prot.classe_86 IN ('INEGOCIAVEL', 'PROTEGIDO')
GROUP BY pvf.unit_id, fe.insumo_id, COALESCE(i.descricao, 'Item sem cadastro');

REVOKE ALL   ON public.v_86_heranca_insumo FROM PUBLIC, anon, authenticated;
GRANT  SELECT ON public.v_86_heranca_insumo TO   service_role;

-- ─── 6. Função de refresh + cron + refresh no deploy ─────────────────────

CREATE OR REPLACE FUNCTION public.atualizar_pareto_prato() RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE log_id bigint;
BEGIN
  INSERT INTO public.prisma_refresh_log(etapa) VALUES ('pareto_prato') RETURNING id INTO log_id;
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_pareto_prato;
    UPDATE public.prisma_refresh_log SET concluido_em = now() WHERE id = log_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.prisma_refresh_log SET concluido_em = now(), erro = SQLERRM WHERE id = log_id;
  END;
END $$;
REVOKE ALL  ON FUNCTION public.atualizar_pareto_prato() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_pareto_prato() TO service_role;

-- 10 min após compras-tendencia-refresh-mensal (5 11 1 * * → 15 11 1 * *)
SELECT cron.schedule(
  'compras-pareto-prato-refresh-mensal',
  '15 11 1 * *',
  'SELECT public.atualizar_pareto_prato()'
);

-- Primeiro refresh: não pode usar CONCURRENTLY (view vazia)
REFRESH MATERIALIZED VIEW public.mv_pareto_prato;

NOTIFY pgrst, 'reload schema';
COMMIT;
