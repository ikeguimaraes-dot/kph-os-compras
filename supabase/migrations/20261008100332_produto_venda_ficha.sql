-- Financeiro owns the shared, unit-scoped sales-to-recipe bridge.
CREATE TABLE public.produto_venda_ficha (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 unit_id uuid NOT NULL REFERENCES public.units(id),
 nome_venda text NOT NULL, nome_venda_original text,
 ficha_id uuid REFERENCES public.everest_fichas_tecnicas(id),
 item_pai_id uuid REFERENCES public.everest_itens(id),
 origem text NOT NULL DEFAULT 'auto' CHECK(origem IN ('auto','manual')),
 status text NOT NULL DEFAULT 'pendente' CHECK(status IN ('confirmado','pendente','sem_ficha','rejeitado')),
 similaridade numeric, sugestoes jsonb NOT NULL DEFAULT '[]',
 receita_12m numeric NOT NULL DEFAULT 0, qtd_12m numeric NOT NULL DEFAULT 0,
 confirmado_por text, confirmado_em timestamptz,
 criado_em timestamptz NOT NULL DEFAULT now(), atualizado_em timestamptz NOT NULL DEFAULT now(),
 UNIQUE(unit_id,nome_venda),
 CHECK(status<>'confirmado' OR ficha_id IS NOT NULL)
);
CREATE INDEX ON public.produto_venda_ficha(unit_id,status,receita_12m DESC);
ALTER TABLE public.produto_venda_ficha ENABLE ROW LEVEL SECURITY;
CREATE POLICY ponte_ler ON public.produto_venda_ficha FOR SELECT TO authenticated USING(public.kph_has_role_for_unit(unit_id));
CREATE POLICY ponte_servico ON public.produto_venda_ficha FOR ALL TO service_role USING(true) WITH CHECK(true);
GRANT SELECT ON public.produto_venda_ficha TO authenticated;
GRANT ALL ON public.produto_venda_ficha TO service_role;

CREATE VIEW public.v_ponte_fichas WITH (security_invoker=true) AS
SELECT DISTINCT ON(c.unit_id,f.item_pai_id)
 c.unit_id,f.id ficha_id,f.item_pai_id,f.qt_producao,f.versao,
 i.descricao,upper(public.unaccent(trim(i.descricao))) nome
FROM public.everest_fichas_tecnicas f
JOIN public.everest_fichas_tecnicas_custo c ON c.ficha_id=f.id
JOIN public.everest_itens i ON i.id=f.item_pai_id
JOIN public.units u ON u.id=c.unit_id
WHERE
 (upper(public.unaccent(i.descricao)) !~ '\m(FRNZ|FRENEZE)\M' OR upper(public.unaccent(u.name)) LIKE '%FRENEZE%')
 AND (upper(public.unaccent(i.descricao)) !~ '\mMADONNA\M' OR upper(public.unaccent(u.name)) LIKE '%MADONNA%')
 AND (upper(public.unaccent(i.descricao)) !~ '\mMATCH\M' OR upper(public.unaccent(u.name)) LIKE '%MATCH%')
 AND (upper(public.unaccent(i.descricao)) !~ '\mMEET\M' OR upper(public.unaccent(u.name)) LIKE '%MEET%')
ORDER BY c.unit_id,f.item_pai_id,f.versao DESC NULLS LAST,f.id;
GRANT SELECT ON public.v_ponte_fichas TO authenticated,service_role;

CREATE FUNCTION public.sugerir_ponte(p_unit uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('ponte:'||p_unit::text));
 -- Reset rolling metrics, preserving every manual choice and audit field.
 UPDATE public.produto_venda_ficha SET receita_12m=0,qtd_12m=0 WHERE unit_id=p_unit;
 WITH vendas AS (
 SELECT upper(public.unaccent(trim(p.produto))) nome,min(p.produto) original,
 sum(p.total) receita,sum(p.qtd) qtd
 FROM public.lorean_produtos_dia p JOIN public.lorean_workdays w ON w.id=p.workday_id_fk
 WHERE w.unit_id=p_unit AND w.data >= (current_date-interval '12 months')::date
 AND w.data<=current_date AND nullif(trim(p.produto),'') IS NOT NULL
 GROUP BY 1
 ), candidatos AS (
 SELECT v.*,b.ficha_id,b.item_pai_id,b.sim,b.segunda,b.sugestoes
 FROM vendas v LEFT JOIN LATERAL (
 SELECT (array_agg(t.ficha_id ORDER BY t.sim DESC,t.ficha_id))[1] ficha_id,
 (array_agg(t.item_pai_id ORDER BY t.sim DESC,t.ficha_id))[1] item_pai_id,
 max(t.sim) sim,(array_agg(t.sim ORDER BY t.sim DESC,t.ficha_id))[2] segunda,
 jsonb_agg(jsonb_build_object('ficha_id',t.ficha_id,'item_pai_id',t.item_pai_id,
 'nome',t.descricao,'similaridade',t.sim) ORDER BY t.sim DESC,t.ficha_id) sugestoes
 FROM (
 SELECT f.*,public.similarity(f.nome,v.nome) sim FROM public.v_ponte_fichas f
 WHERE f.unit_id=p_unit
 AND NOT(v.nome LIKE 'OJO BIFE%' AND f.nome LIKE 'ARROZ BIRO BIRO%')
 ORDER BY sim DESC,f.ficha_id LIMIT 3
 ) t
 ) b ON true
 )
 INSERT INTO public.produto_venda_ficha(unit_id,nome_venda,nome_venda_original,ficha_id,item_pai_id,
 origem,status,similaridade,sugestoes,receita_12m,qtd_12m,confirmado_em)
 SELECT p_unit,nome,original,CASE WHEN sim>=0.60 THEN ficha_id END,
 CASE WHEN sim>=0.60 THEN item_pai_id END,'auto',
 CASE WHEN sim>=0.90 AND (segunda IS NULL OR sim-segunda>=0.03) THEN 'confirmado' ELSE 'pendente' END,
 sim,CASE WHEN sim>=0.60 THEN coalesce(sugestoes,'[]') ELSE '[]' END,coalesce(receita,0),coalesce(qtd,0),
 CASE WHEN sim>=0.90 AND (segunda IS NULL OR sim-segunda>=0.03) THEN now() END
 FROM candidatos
 ON CONFLICT(unit_id,nome_venda) DO UPDATE SET
 receita_12m=excluded.receita_12m,qtd_12m=excluded.qtd_12m,atualizado_em=now();
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.sugerir_ponte(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sugerir_ponte(uuid) TO service_role;
NOTIFY pgrst,'reload schema';

