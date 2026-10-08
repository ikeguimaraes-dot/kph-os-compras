-- New read-only models; no source table is changed.
CREATE VIEW public.v_compras_fornecedores WITH(security_invoker=true) AS
SELECT unit_id,
CASE WHEN length(regexp_replace(cpf_cnpj,'\D','','g'))=14 THEN left(regexp_replace(cpf_cnpj,'\D','','g'),8)
WHEN length(regexp_replace(cpf_cnpj,'\D','','g'))=11 THEN regexp_replace(cpf_cnpj,'\D','','g')
ELSE id::text END id,
max(coalesce(nullif(trim(nome_fantasia),''),razao_social)) nome,
string_agg(distinct cpf_cnpj,', ') documentos,count(*) cadastros
FROM public.everest_fornecedores GROUP BY 1,2;
CREATE VIEW public.v_compras_ingredientes WITH(security_invoker=true) AS
SELECT u.unit_id,i.id,i.cd_item codigo,i.descricao nome,i.unidade_medida unidade,i.grupo categoria,
h.vl_custo_medio custo,h.ano,h.mes,h.snapshot_em
FROM public.everest_itens i CROSS JOIN (SELECT DISTINCT unit_id FROM public.everest_unidades WHERE NOT fora_do_escopo_cmv AND unit_id IS NOT NULL) u
LEFT JOIN LATERAL(SELECT * FROM public.everest_itens_custo_historico h WHERE h.item_id=i.id AND h.unit_id=u.unit_id ORDER BY h.ano DESC,h.mes DESC,h.snapshot_em DESC NULLS LAST LIMIT 1) h ON true;
CREATE VIEW public.v_compras_cardapio WITH(security_invoker=true) AS
SELECT f.unit_id,f.ficha_id id,f.descricao nome,i.cd_item codigo,i.grupo categoria_everest,
f.qt_producao rendimento,f.versao,c.custo_total custo,c.custo_por_kg,c.composicao_fechada,
meta.id metadata_id,meta.preco_venda,meta.categoria
FROM public.v_ponte_fichas f JOIN public.everest_itens i ON i.id=f.item_pai_id
JOIN public.everest_fichas_tecnicas_custo c ON c.ficha_id=f.ficha_id AND c.unit_id=f.unit_id
LEFT JOIN LATERAL (
 SELECT (array_agg(m.id))[1] id,max(m.preco_venda) preco_venda,max(m.categoria) categoria
 FROM public.menu_items m WHERE m.unit_id=f.unit_id AND
 ((nullif(m.codigo,'') IS NOT NULL AND m.codigo=i.cd_item) OR
 (nullif(m.codigo,'') IS NULL AND upper(public.unaccent(trim(m.nome)))=f.nome))
 HAVING count(*)=1
) meta ON true;
CREATE VIEW public.v_compras_notas WITH(security_invoker=true) AS
SELECT n.unit_id,n.id,n.nr_nota numero,n.dh_emissao,
(n.dh_emissao AT TIME ZONE 'America/Sao_Paulo')::date data,
coalesce(nullif(trim(f.nome_fantasia),''),f.razao_social,'Sem vínculo') nome,
n.vl_total total,n.situacao,n.dt_lancamento
FROM public.everest_notas_recebidas n LEFT JOIN public.everest_fornecedores f ON f.id=n.fornecedor_id;
CREATE VIEW public.v_compras_notas_resumo WITH(security_invoker=true) AS
SELECT unit_id,date_trunc('month',data)::date mes,count(*) notas,sum(total) total
FROM public.v_compras_notas GROUP BY 1,2;
CREATE VIEW public.v_compras_inventarios WITH(security_invoker=true) AS
SELECT v.unit_id,v.id,v.dt_inventario data,v.deposito nome,v.nr_inventario numero,v.situacao,
count(i.id) itens,sum(i.valor_ajustado_api) valor_ajustado
FROM public.everest_inventarios v LEFT JOIN public.everest_inventario_itens i ON i.inventario_id=v.id
GROUP BY v.id;
REVOKE ALL ON public.v_compras_fornecedores,public.v_compras_ingredientes,public.v_compras_cardapio,
public.v_compras_notas,public.v_compras_notas_resumo,public.v_compras_inventarios FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.v_compras_fornecedores,public.v_compras_ingredientes,public.v_compras_cardapio,
public.v_compras_notas,public.v_compras_notas_resumo,public.v_compras_inventarios TO service_role;
NOTIFY pgrst,'reload schema';

