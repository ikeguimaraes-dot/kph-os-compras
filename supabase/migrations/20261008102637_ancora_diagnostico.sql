CREATE VIEW public.v_ancora_diagnostico WITH(security_invoker=true) AS
WITH compras AS(
SELECT unit_id,item_id,sum(vl_total) comprado_rs,sum(quantidade) quantidade_comprada FROM public.v_compra_cmv_base
WHERE data>=(current_date-interval '12 months')::date AND data<=current_date AND item_id IS NOT NULL GROUP BY 1,2),
teorico AS(
SELECT b.unit_id,f.insumo_id item_id,sum(b.qtd_12m*f.quantidade) quantidade_teorica
FROM public.produto_venda_ficha b JOIN public.v_ficha_explodida f ON f.unit_id=b.unit_id AND f.ficha_id=b.ficha_id
WHERE b.status='confirmado' GROUP BY 1,2)
SELECT coalesce(c.unit_id,t.unit_id) unit_id,coalesce(c.item_id,t.item_id) item_id,i.descricao item_nome,i.unidade_medida,
coalesce(c.comprado_rs,0) comprado_rs,coalesce(c.quantidade_comprada,0) quantidade_comprada,coalesce(t.quantidade_teorica,0) quantidade_teorica,
p.preco_medio,p.preco_medio IS NULL sem_preco,
coalesce(t.quantidade_teorica,0)*p.preco_medio consumo_parcial_rs,
coalesce(c.comprado_rs,0)-coalesce(t.quantidade_teorica*p.preco_medio,0) diferenca_rs
FROM compras c FULL JOIN teorico t USING(unit_id,item_id)
LEFT JOIN public.everest_itens i ON i.id=coalesce(c.item_id,t.item_id)
LEFT JOIN public.v_preco_medio_compra p ON p.unit_id=coalesce(c.unit_id,t.unit_id) AND p.item_id=coalesce(c.item_id,t.item_id);
REVOKE ALL ON public.v_ancora_diagnostico FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.v_ancora_diagnostico TO service_role;
NOTIFY pgrst,'reload schema';
