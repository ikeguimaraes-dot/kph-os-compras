-- Snapshot of the materialization already installed out-of-band on 2026-10-08.
-- Do not execute against iqgrvptrtphvbmvrqntm: reconcile migration history only.
-- Replay on a database at 20261008193301. The original calculation is preserved.
-- Definitions, relation options and ACLs captured from the live PostgreSQL catalog.
BEGIN;
SET LOCAL search_path = public, pg_catalog;

DROP VIEW public.v_mapa_fornecedor;
ALTER VIEW public.v_mapa_aresta RENAME TO v_mapa_aresta_calc;

CREATE MATERIALIZED VIEW public.mv_mapa_aresta AS
SELECT unit_id,
    raiz_cnpj,
    insumo_id,
    produto_venda_ficha_id,
    prato,
    receita_12m,
    receita_semana,
    peso_custo,
    share_fornecedor,
    receita_atribuida,
    critico,
    insumo,
    categoria,
    reserva,
    ultima_compra,
    principal_90d,
    principal_12m,
    fornecedor_trocou
   FROM v_mapa_aresta_calc
WITH DATA;

CREATE INDEX mv_mapa_aresta_unit_forn_idx ON public.mv_mapa_aresta USING btree (unit_id, raiz_cnpj);
CREATE INDEX mv_mapa_aresta_prato_idx ON public.mv_mapa_aresta USING btree (unit_id, produto_venda_ficha_id);

CREATE VIEW public.v_mapa_aresta AS
SELECT unit_id,
    raiz_cnpj,
    insumo_id,
    produto_venda_ficha_id,
    prato,
    receita_12m,
    receita_semana,
    peso_custo,
    share_fornecedor,
    receita_atribuida,
    critico,
    insumo,
    categoria,
    reserva,
    ultima_compra,
    principal_90d,
    principal_12m,
    fornecedor_trocou
   FROM mv_mapa_aresta;

CREATE VIEW public.v_mapa_fornecedor AS
WITH compras AS (
         SELECT v_mapa_compra.unit_id,
            v_mapa_compra.fornecedor_grupo AS raiz_cnpj,
            max(v_mapa_compra.fornecedor_nome) AS nome,
            sum(v_mapa_compra.vl_total) AS gasto_12m
           FROM v_mapa_compra
          GROUP BY v_mapa_compra.unit_id, v_mapa_compra.fornecedor_grupo
        ), vendas AS (
         SELECT v_mapa_aresta.unit_id,
            v_mapa_aresta.raiz_cnpj,
            sum(v_mapa_aresta.receita_atribuida) AS receita_atribuida,
            count(DISTINCT v_mapa_aresta.produto_venda_ficha_id) AS pratos_dependentes
           FROM v_mapa_aresta
          GROUP BY v_mapa_aresta.unit_id, v_mapa_aresta.raiz_cnpj
        ), titulos AS (
         SELECT v_mapa_titulo.unit_id,
            v_mapa_titulo.raiz_cnpj,
            sum(v_mapa_titulo.vl_saldo) AS em_aberto,
            COALESCE(sum(v_mapa_titulo.vl_saldo) FILTER (WHERE v_mapa_titulo.dias_atraso > 0), 0::numeric) AS vencido,
            COALESCE(sum(v_mapa_titulo.vl_saldo) FILTER (WHERE v_mapa_titulo.dias_atraso <= 0), 0::numeric) AS a_vencer,
            COALESCE(sum(v_mapa_titulo.vl_saldo) FILTER (WHERE v_mapa_titulo.dias_atraso > 120), 0::numeric) AS a_conciliar
           FROM v_mapa_titulo
          GROUP BY v_mapa_titulo.unit_id, v_mapa_titulo.raiz_cnpj
        ), universo AS (
         SELECT compras.unit_id,
            compras.raiz_cnpj
           FROM compras
        UNION
         SELECT titulos.unit_id,
            titulos.raiz_cnpj
           FROM titulos
        ), prato AS (
         SELECT produto_venda_ficha.unit_id,
            sum(produto_venda_ficha.receita_12m) AS receita_total,
            count(*) FILTER (WHERE produto_venda_ficha.receita_12m > 0::numeric) AS pratos_vendidos
           FROM produto_venda_ficha
          GROUP BY produto_venda_ficha.unit_id
        ), metrics AS (
         SELECT u.unit_id,
            u.raiz_cnpj,
            COALESCE(ap.apelido, c.nome, u.raiz_cnpj) AS nome,
            COALESCE(c.gasto_12m, 0::numeric) AS gasto_12m,
            COALESCE(c.gasto_12m, 0::numeric) / NULLIF(sum(c.gasto_12m) OVER (PARTITION BY u.unit_id), 0::numeric) AS pct_compras_casa,
            sum(COALESCE(c.gasto_12m, 0::numeric)) OVER (PARTITION BY u.raiz_cnpj) / NULLIF(sum(c.gasto_12m) OVER (), 0::numeric) AS pct_compras_grupo,
            dense_rank() OVER (PARTITION BY u.unit_id ORDER BY (COALESCE(c.gasto_12m, 0::numeric)) DESC) AS ranking,
            count(*) OVER (PARTITION BY u.unit_id) AS fornecedores_total,
            COALESCE(v.receita_atribuida, 0::numeric) AS receita_atribuida,
            COALESCE(v.receita_atribuida, 0::numeric) / NULLIF(p.receita_total, 0::numeric) AS pct_receita,
            COALESCE(v.pratos_dependentes, 0::bigint) AS pratos_dependentes,
            p.pratos_vendidos,
            p.receita_total,
            COALESCE(t.em_aberto, 0::numeric) AS em_aberto,
            COALESCE(t.vencido, 0::numeric) AS vencido,
            COALESCE(t.a_vencer, 0::numeric) AS a_vencer,
            COALESCE(t.a_conciliar, 0::numeric) AS a_conciliar
           FROM universo u
             LEFT JOIN compras c USING (unit_id, raiz_cnpj)
             LEFT JOIN vendas v USING (unit_id, raiz_cnpj)
             LEFT JOIN titulos t USING (unit_id, raiz_cnpj)
             LEFT JOIN prato p ON p.unit_id = u.unit_id
             LEFT JOIN compras_fornecedor_apelido ap ON ap.raiz_cnpj = u.raiz_cnpj
        ), total_credito AS (
         SELECT titulos.raiz_cnpj,
            sum(titulos.em_aberto) AS aberto_grupo
           FROM titulos
          GROUP BY titulos.raiz_cnpj
        )
 SELECT m.unit_id,
    m.raiz_cnpj,
    m.nome,
    m.gasto_12m,
    m.pct_compras_casa,
    m.pct_compras_grupo,
    m.ranking,
    m.fornecedores_total,
    m.receita_atribuida,
    m.pct_receita,
    m.pratos_dependentes,
    m.pratos_vendidos,
    m.receita_total,
    m.em_aberto,
    m.vencido,
    m.a_vencer,
    m.a_conciliar,
    cr.limite_rs,
    cr.prazo_dias_acordado,
    cr.limite_rs - COALESCE(tc.aberto_grupo, 0::numeric) AS disponivel
   FROM metrics m
     LEFT JOIN compras_fornecedor_credito cr USING (raiz_cnpj)
     LEFT JOIN total_credito tc USING (raiz_cnpj);

REVOKE ALL ON public.mv_mapa_aresta, public.v_mapa_aresta, public.v_mapa_fornecedor FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mv_mapa_aresta, public.v_mapa_aresta, public.v_mapa_fornecedor TO service_role;

-- v_mapa_aresta_calc retains security_invoker=true and its existing ACL.
-- No refresh job is added: this records the installed structure exactly.
COMMIT;
