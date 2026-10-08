-- All inputs remain read-only. Monetary purchasing totals include every CMV line.
CREATE VIEW public.v_compra_cmv_base WITH (security_invoker=true) AS
SELECT n.unit_id,(n.dh_emissao AT TIME ZONE 'America/Sao_Paulo')::date data,
date_trunc('month',n.dh_emissao AT TIME ZONE 'America/Sao_Paulo')::date mes,
ni.id,ni.item_id,ni.vl_total,ni.vl_unitario,
CASE WHEN ni.vl_unitario>0 THEN ni.vl_total/ni.vl_unitario END quantidade,
CASE WHEN length(regexp_replace(f.cpf_cnpj,'\D','','g'))=14
 THEN left(regexp_replace(f.cpf_cnpj,'\D','','g'),8)
 WHEN length(regexp_replace(f.cpf_cnpj,'\D','','g'))=11 THEN regexp_replace(f.cpf_cnpj,'\D','','g')
 ELSE 'sem-cnpj:'||coalesce(n.fornecedor_id::text,'nota:'||n.id::text) END raiz_cnpj,
coalesce(nullif(trim(f.nome_fantasia),''),f.razao_social,'Fornecedor não vinculado') fornecedor_nome
FROM public.everest_notas_recebidas_itens ni JOIN public.everest_notas_recebidas n ON n.id=ni.nota_id
LEFT JOIN public.everest_fornecedores f ON f.id=n.fornecedor_id WHERE ni.entra_cmv_cfop;

CREATE VIEW public.v_ficha_arvore WITH (security_invoker=true) AS
WITH RECURSIVE tree AS (
 SELECT f.unit_id,f.ficha_id,fi.insumo_id,
 fi.qt_aplicada/coalesce(nullif(f.qt_producao,0),1) quantidade,
 1 profundidade,ARRAY[f.item_pai_id,fi.insumo_id] caminho,(fi.insumo_id=f.item_pai_id) ciclo
 FROM public.v_ponte_fichas f JOIN public.everest_fichas_tecnicas_itens fi ON fi.ficha_id=f.ficha_id
 UNION ALL
 SELECT t.unit_id,t.ficha_id,fi.insumo_id,
 t.quantidade*fi.qt_aplicada/coalesce(nullif(s.qt_producao,0),1),
 t.profundidade+1,t.caminho||fi.insumo_id,fi.insumo_id=ANY(t.caminho)
 FROM tree t JOIN public.v_ponte_fichas s ON s.unit_id=t.unit_id AND s.item_pai_id=t.insumo_id
 JOIN public.everest_fichas_tecnicas_itens fi ON fi.ficha_id=s.ficha_id
 WHERE t.profundidade<6 AND NOT t.ciclo
)
SELECT t.*,exists(SELECT 1 FROM public.v_ponte_fichas f WHERE f.unit_id=t.unit_id AND f.item_pai_id=t.insumo_id) subficha
FROM tree t;

CREATE VIEW public.v_ficha_explodida WITH (security_invoker=true) AS
SELECT t.unit_id,t.ficha_id,t.insumo_id,sum(t.quantidade) quantidade
FROM public.v_ficha_arvore t WHERE NOT t.subficha AND NOT t.ciclo
AND NOT EXISTS(SELECT 1 FROM public.v_ficha_arvore bad WHERE bad.unit_id=t.unit_id AND bad.ficha_id=t.ficha_id
AND (bad.ciclo OR (bad.profundidade=6 AND bad.subficha)))
GROUP BY 1,2,3;

CREATE VIEW public.v_preco_medio_compra WITH (security_invoker=true) AS
SELECT unit_id,item_id,
coalesce(sum(vl_total) FILTER(WHERE data>=current_date-90) /
 nullif(sum(quantidade) FILTER(WHERE data>=current_date-90),0),sum(vl_total)/nullif(sum(quantidade),0)) preco_medio,
CASE WHEN coalesce(sum(quantidade) FILTER(WHERE data>=current_date-90),0)>0 THEN 90 ELSE 365 END janela_dias
FROM public.v_compra_cmv_base WHERE data>=(current_date-interval '12 months')::date
AND data<=current_date AND vl_unitario>0 AND vl_total>0 AND item_id IS NOT NULL GROUP BY 1,2;

CREATE VIEW public.v_share_fornecedor_item WITH (security_invoker=true) AS
SELECT unit_id,item_id,raiz_cnpj,max(fornecedor_nome) fornecedor_nome,
sum(vl_total)/nullif(sum(sum(vl_total)) OVER(PARTITION BY unit_id,item_id),0) share
FROM public.v_compra_cmv_base WHERE data>=(current_date-interval '12 months')::date
AND data<=current_date AND vl_unitario>0 AND vl_total>0 AND item_id IS NOT NULL GROUP BY 1,2,3;

CREATE MATERIALIZED VIEW public.mv_fornecedor_ancora AS
WITH compras AS (
 SELECT unit_id,mes,raiz_cnpj,max(fornecedor_nome) fornecedor_nome,sum(vl_total) comprado_rs
 FROM public.v_compra_cmv_base WHERE data>=(current_date-interval '12 months')::date AND data<=current_date GROUP BY 1,2,3
), vendas AS (
 SELECT w.unit_id,date_trunc('month',w.data)::date mes,b.ficha_id,b.nome_venda,
 sum(p.qtd) qtd,sum(p.total) receita
 FROM public.lorean_produtos_dia p JOIN public.lorean_workdays w ON w.id=p.workday_id_fk
 JOIN public.produto_venda_ficha b ON b.unit_id=w.unit_id AND b.nome_venda=upper(public.unaccent(trim(p.produto))) AND b.status='confirmado'
 WHERE w.data>=(current_date-interval '12 months')::date AND w.data<=current_date
 GROUP BY 1,2,3,4
), custos AS (
 SELECT f.*,p.preco_medio,f.quantidade*p.preco_medio custo,
 bool_and(p.preco_medio IS NOT NULL AND f.quantidade>=0) OVER(PARTITION BY f.unit_id,f.ficha_id) custo_completo,
 sum(f.quantidade*p.preco_medio) OVER(PARTITION BY f.unit_id,f.ficha_id) custo_total
 FROM public.v_ficha_explodida f LEFT JOIN public.v_preco_medio_compra p ON p.unit_id=f.unit_id AND p.item_id=f.insumo_id
), atribuicao AS (
 SELECT v.unit_id,v.mes,s.raiz_cnpj,max(s.fornecedor_nome) fornecedor_nome,
 sum(v.qtd*c.custo*s.share) consumo_teorico_rs,
 sum(v.receita*c.custo*s.share/nullif(c.custo_total,0)) receita_dependente_rs,
 count(DISTINCT v.nome_venda) pratos
 FROM vendas v JOIN custos c ON c.unit_id=v.unit_id AND c.ficha_id=v.ficha_id AND c.custo_completo AND c.custo_total>0
 JOIN public.v_share_fornecedor_item s ON s.unit_id=v.unit_id AND s.item_id=c.insumo_id GROUP BY 1,2,3
), cobertura AS (
 SELECT w.unit_id,date_trunc('month',w.data)::date mes,
 coalesce(sum(p.total) FILTER(WHERE b.status='confirmado'),0)/nullif(sum(p.total),0) cobertura_receita
 FROM public.lorean_produtos_dia p JOIN public.lorean_workdays w ON w.id=p.workday_id_fk
 LEFT JOIN public.produto_venda_ficha b ON b.unit_id=w.unit_id AND b.nome_venda=upper(public.unaccent(trim(p.produto)))
 WHERE w.data>=(current_date-interval '12 months')::date AND w.data<=current_date GROUP BY 1,2
)
SELECT coalesce(c.unit_id,a.unit_id) unit_id,coalesce(c.mes,a.mes) mes,coalesce(c.raiz_cnpj,a.raiz_cnpj) raiz_cnpj,
coalesce(c.fornecedor_nome,a.fornecedor_nome) fornecedor_nome,coalesce(c.comprado_rs,0) comprado_rs,
coalesce(a.consumo_teorico_rs,0) consumo_teorico_rs,coalesce(a.receita_dependente_rs,0) receita_dependente_rs,
coalesce(a.pratos,0) pratos,coalesce(cv.cobertura_receita,0) cobertura_receita,now() atualizado_em
FROM compras c FULL JOIN atribuicao a USING(unit_id,mes,raiz_cnpj)
LEFT JOIN cobertura cv ON cv.unit_id=coalesce(c.unit_id,a.unit_id) AND cv.mes=coalesce(c.mes,a.mes);

CREATE UNIQUE INDEX mv_fornecedor_ancora_key ON public.mv_fornecedor_ancora(unit_id,mes,raiz_cnpj);
CREATE INDEX ON public.mv_fornecedor_ancora(mes);
CREATE INDEX ON public.mv_fornecedor_ancora(raiz_cnpj);
-- Materialized views have no RLS; access is restricted to checked server actions.
REVOKE ALL ON public.mv_fornecedor_ancora FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.mv_fornecedor_ancora TO service_role;
GRANT SELECT ON public.v_compra_cmv_base,public.v_ficha_arvore,public.v_ficha_explodida,public.v_preco_medio_compra,public.v_share_fornecedor_item TO service_role;
REVOKE ALL ON public.v_compra_cmv_base,public.v_ficha_arvore,public.v_ficha_explodida,public.v_preco_medio_compra,public.v_share_fornecedor_item FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.atualizar_ancoras_diaria() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE log_id bigint;
BEGIN
 INSERT INTO public.prisma_refresh_log(etapa) VALUES('ancoras') RETURNING id INTO log_id;
 BEGIN
 REFRESH MATERIALIZED VIEW public.mv_fornecedor_ancora;
 UPDATE public.prisma_refresh_log SET concluido_em=now() WHERE id=log_id;
 EXCEPTION WHEN OTHERS THEN UPDATE public.prisma_refresh_log SET concluido_em=now(),erro=SQLERRM WHERE id=log_id;
 END;
END $$;
REVOKE ALL ON FUNCTION public.atualizar_ancoras_diaria() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_ancoras_diaria() TO service_role;
SELECT cron.schedule('prisma-ancoras-diaria','30 11 * * *','SELECT public.atualizar_ancoras_diaria()');
NOTIFY pgrst,'reload schema';

