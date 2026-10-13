-- Prompt 15 — Ciclo de vida do 86 + alerta 85 (estoque mínimo)
-- Parte A: v_86_episodio — agrupa registros de op_86 em episódios com entrada/saída
-- Parte B: compras_estoque_minimo — mínimos editáveis + status 85

-- ─── Parte A: colunas de baixa manual na abastecimento_86 ─────────────────────
ALTER TABLE public.abastecimento_86
  ADD COLUMN IF NOT EXISTS resolvido_por UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS resolvido_em  TIMESTAMPTZ;

-- ─── Parte B: tabela estoque mínimo ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.compras_estoque_minimo (
  unit_id      UUID    NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  insumo_id    UUID    NOT NULL REFERENCES public.everest_itens(id) ON DELETE CASCADE,
  qtd_minima   NUMERIC NOT NULL CHECK(qtd_minima >= 0),
  atualizado_por UUID  REFERENCES auth.users(id),
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (unit_id, insumo_id)
);
ALTER TABLE public.compras_estoque_minimo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.compras_estoque_minimo FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.compras_estoque_minimo TO service_role;
CREATE POLICY estoque_minimo_service ON public.compras_estoque_minimo
  TO service_role USING(true) WITH CHECK(true);
CREATE INDEX IF NOT EXISTS estoque_minimo_unit ON public.compras_estoque_minimo(unit_id);

-- ─── Parte A: view de episódios de 86 ────────────────────────────────────────
-- Decisão de implementação: usa abastecimento_86.criado_em como proxy para
-- op_86.created_at (é preenchida na mesma transação da sincronização).
-- Episódio = sequência contínua de registros sem venda do produto entre eles.
-- "Contínua" = para cada registro, verificamos se houve venda POSTERIOR ao
-- registro anterior do mesmo produto×casa; se sim, novo episódio.
DROP VIEW IF EXISTS public.v_86_episodio;
CREATE VIEW public.v_86_episodio WITH (security_invoker=true) AS
WITH registros AS (
  -- Todos os registros com produto identificado
  SELECT
    a.id                                                          AS abastecimento_id,
    a.unit_id,
    COALESCE(a.produto_venda_ficha_id, a.sugestao_prato_id)      AS produto_id,
    a.criado_em                                                   AS op_criado_em,
    r.data                                                        AS op_data,
    a.tipo::TEXT                                                  AS tipo,
    a.causa::TEXT                                                 AS causa,
    a.resolvido_por,
    a.resolvido_em,
    b.nome_venda
  FROM public.abastecimento_86 a
  JOIN public.op_86 o ON o.id = a.op_86_id
  JOIN public.op_relatorio_diario r ON r.id = o.relatorio_id
  LEFT JOIN public.produto_venda_ficha b
         ON b.id = COALESCE(a.produto_venda_ficha_id, a.sugestao_prato_id)
  WHERE COALESCE(a.produto_venda_ficha_id, a.sugestao_prato_id) IS NOT NULL
),
-- Data do registro anterior por produto×casa (para detectar limite de episódio)
registros_ord AS (
  SELECT
    *,
    LAG(op_data) OVER (
      PARTITION BY unit_id, produto_id ORDER BY op_criado_em
    ) AS prev_op_data
  FROM registros
),
-- Novo episódio: primeiro registro OU houve venda entre o anterior e este
episodios_marcados AS (
  SELECT
    *,
    CASE
      WHEN prev_op_data IS NULL THEN 1
      WHEN EXISTS (
        SELECT 1
        FROM public.lorean_workdays w
        JOIN public.lorean_produtos_dia p ON p.workday_id_fk = w.id
        WHERE w.unit_id = registros_ord.unit_id
          AND w.data > registros_ord.prev_op_data
          AND w.data < registros_ord.op_data
          AND p.qtd > 0
          AND public.abastecimento_nome(p.produto) = public.abastecimento_nome(registros_ord.nome_venda)
      ) THEN 1
      ELSE 0
    END AS novo_episodio
  FROM registros_ord
),
-- Numeração cumulativa de episódios por produto×casa
ep_grupos AS (
  SELECT
    *,
    SUM(novo_episodio) OVER (
      PARTITION BY unit_id, produto_id ORDER BY op_criado_em
    ) AS ep_num
  FROM episodios_marcados
),
-- Agrupamento por episódio
episodios AS (
  SELECT
    unit_id,
    produto_id,
    ep_num,
    MIN(op_criado_em)     AS entrada_at,
    MIN(op_data)          AS entrada_data,
    COUNT(*)              AS num_registros,
    (ARRAY_AGG(abastecimento_id ORDER BY op_criado_em))[1] AS primeiro_abastecimento_id,
    -- Baixa manual: pega o mínimo (mais antigo) de todos resolvido_em do episódio
    MIN(resolvido_em)     AS resolvido_em,
    (ARRAY_AGG(resolvido_por ORDER BY resolvido_em NULLS LAST))[1] AS resolvido_por,
    (ARRAY_AGG(tipo ORDER BY op_criado_em))[1]  AS tipo,
    (ARRAY_AGG(causa ORDER BY op_criado_em))[1] AS causa,
    (ARRAY_AGG(nome_venda ORDER BY op_criado_em NULLS LAST))[1] AS produto_nome
  FROM ep_grupos
  GROUP BY unit_id, produto_id, ep_num
),
-- Primeira venda do produto após a entrada do episódio
saida_venda AS (
  SELECT DISTINCT ON (e.unit_id, e.produto_id, e.ep_num)
    e.unit_id,
    e.produto_id,
    e.ep_num,
    (w.data::TIMESTAMP AT TIME ZONE 'America/Sao_Paulo') AS saida_venda_at
  FROM episodios e
  JOIN public.produto_venda_ficha b ON b.id = e.produto_id AND b.unit_id = e.unit_id
  JOIN public.lorean_workdays w
         ON w.unit_id = e.unit_id AND w.data > e.entrada_data
  JOIN public.lorean_produtos_dia p ON p.workday_id_fk = w.id
    AND p.qtd > 0
    AND public.abastecimento_nome(p.produto) = public.abastecimento_nome(b.nome_venda)
  ORDER BY e.unit_id, e.produto_id, e.ep_num, w.data
),
-- Receita média semanal (receita_12m / 52)
receita AS (
  SELECT
    id       AS produto_id,
    unit_id,
    ROUND(COALESCE(receita_12m, 0) / 52.0, 2) AS receita_semana
  FROM public.produto_venda_ficha
)
SELECT
  e.unit_id,
  e.produto_id,
  e.ep_num,
  e.produto_nome,
  u.name                AS casa_nome,
  e.entrada_at,
  e.entrada_data,
  e.num_registros::INT,
  e.tipo,
  e.causa,
  e.primeiro_abastecimento_id,
  -- Saída: menor entre baixa manual e primeira venda
  CASE
    WHEN e.resolvido_em IS NOT NULL AND sv.saida_venda_at IS NOT NULL
      THEN LEAST(e.resolvido_em, sv.saida_venda_at)
    ELSE COALESCE(e.resolvido_em, sv.saida_venda_at)
  END AS saida_at,
  CASE
    WHEN e.resolvido_em IS NOT NULL
      AND (sv.saida_venda_at IS NULL OR e.resolvido_em <= sv.saida_venda_at)
      THEN 'baixa_manual'
    WHEN sv.saida_venda_at IS NOT NULL THEN 'voltou_a_vender'
    ELSE NULL
  END AS saida_tipo,
  sv.saida_venda_at,
  e.resolvido_em        AS baixa_manual_em,
  -- Dias em 86 (até saída ou até hoje se aberto)
  EXTRACT(EPOCH FROM (
    COALESCE(
      CASE
        WHEN e.resolvido_em IS NOT NULL AND sv.saida_venda_at IS NOT NULL
          THEN LEAST(e.resolvido_em, sv.saida_venda_at)
        ELSE COALESCE(e.resolvido_em, sv.saida_venda_at)
      END,
      NOW() AT TIME ZONE 'America/Sao_Paulo'
    ) - e.entrada_at
  ) / 86400.0)::INT     AS dias_em_86,
  COALESCE(r.receita_semana, 0) AS receita_semana
FROM episodios e
LEFT JOIN public.units u ON u.id = e.unit_id
LEFT JOIN saida_venda sv USING (unit_id, produto_id, ep_num)
LEFT JOIN receita r USING (produto_id, unit_id);

-- Permissões
REVOKE ALL ON public.v_86_episodio FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_86_episodio TO service_role;
REVOKE ALL ON public.compras_estoque_minimo FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.compras_estoque_minimo TO service_role;

NOTIFY pgrst, 'reload schema';
