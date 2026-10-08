CREATE VIEW public.v_prisma_linhas WITH(security_invoker=true) AS
SELECT b.*,coalesce(i.descricao,'Item não vinculado') item_nome,i.unidade_medida unidade,
coalesce(i.grupo,'Sem classificação') categoria,ni.nr_pedido
FROM public.v_compra_cmv_base b JOIN public.everest_notas_recebidas_itens ni ON ni.id=b.id
LEFT JOIN public.everest_itens i ON i.id=b.item_id;
CREATE VIEW public.v_prisma_item_fornecedor WITH(security_invoker=true) AS
SELECT item_id,raiz_cnpj,max(fornecedor_nome) fornecedor_nome,max(categoria) categoria,
sum(vl_total) gasto,sum(quantidade) quantidade,sum(vl_total)/nullif(sum(quantidade),0) preco,
sum(vl_total) FILTER(WHERE nullif(trim(nr_pedido),'') IS NOT NULL AND trim(nr_pedido)!~'^0+$') gasto_pedido,
sum(vl_total) FILTER(WHERE data<(current_date-interval '12 months')::date+90)/
nullif(sum(quantidade) FILTER(WHERE data<(current_date-interval '12 months')::date+90),0) preco_inicio,
sum(vl_total) FILTER(WHERE data>=current_date-89)/
nullif(sum(quantidade) FILTER(WHERE data>=current_date-89),0) preco_fim,
stddev_pop(vl_unitario)/nullif(avg(vl_unitario),0) oscilacao
FROM public.v_prisma_linhas WHERE data>=(current_date-interval '12 months')::date AND data<=current_date
AND vl_total>0 AND vl_unitario>0 AND item_id IS NOT NULL GROUP BY 1,2;
CREATE VIEW public.v_prisma_comparacao WITH(security_invoker=true) AS
WITH itens AS(SELECT item_id,count(*) fornecedores,min(preco) pmin,max(preco) pmax FROM public.v_prisma_item_fornecedor GROUP BY 1)
SELECT s.*,i.fornecedores=1 exclusivo,
i.fornecedores>1 AND i.pmax/nullif(i.pmin,0)<=2.5 comparavel,
CASE WHEN i.fornecedores>1 AND i.pmax/nullif(i.pmin,0)<=2.5 THEN greatest(s.preco-i.pmin,0)*s.quantidade ELSE 0 END pago_acima,
s.preco_fim/nullif(s.preco_inicio,0)-1 inflacao
FROM public.v_prisma_item_fornecedor s JOIN itens i USING(item_id);
CREATE VIEW public.v_prisma_categoria WITH(security_invoker=true) AS
WITH gasto_fornecedor AS(
SELECT categoria,raiz_cnpj,sum(vl_total) gasto,sum(vl_total) FILTER(WHERE nullif(trim(nr_pedido),'') IS NOT NULL AND trim(nr_pedido)!~'^0+$') pedido FROM public.v_prisma_linhas
WHERE data>=(current_date-interval '12 months')::date AND data<=current_date GROUP BY 1,2),
ranked AS(SELECT *,sum(gasto) OVER(PARTITION BY categoria ORDER BY gasto DESC,raiz_cnpj ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) anterior,sum(gasto) OVER(PARTITION BY categoria) total FROM gasto_fornecedor),
kpi AS(SELECT categoria,sum(pago_acima) pago_acima,sum(inflacao*gasto)/nullif(sum(gasto) FILTER(WHERE inflacao IS NOT NULL),0) inflacao FROM public.v_prisma_comparacao GROUP BY 1)
SELECT r.categoria,sum(r.gasto) gasto,count(*) fornecedores,count(*) FILTER(WHERE coalesce(anterior,0)<total*0.8) fazem_80,max(r.gasto)/nullif(sum(r.gasto),0) maior_fatia,
coalesce(sum(pedido),0)/nullif(sum(r.gasto),0) com_pedido,k.inflacao,coalesce(k.pago_acima,0) pago_acima
FROM ranked r LEFT JOIN kpi k USING(categoria) GROUP BY r.categoria,k.inflacao,k.pago_acima;
CREATE VIEW public.v_prisma_fornecedor WITH(security_invoker=true) AS
WITH kpi AS(SELECT raiz_cnpj,sum(gasto) FILTER(WHERE exclusivo) gasto_exclusivo,sum(pago_acima) pago_acima,
sum(inflacao*gasto)/nullif(sum(gasto) FILTER(WHERE inflacao IS NOT NULL),0) inflacao,
sum(oscilacao*gasto)/nullif(sum(gasto) FILTER(WHERE oscilacao IS NOT NULL),0) oscilacao
FROM public.v_prisma_comparacao GROUP BY 1),
cats AS(SELECT raiz_cnpj,categoria,sum(vl_total) gasto,row_number() OVER(PARTITION BY raiz_cnpj ORDER BY sum(vl_total) DESC,categoria) rn FROM public.v_prisma_linhas
WHERE data>=(current_date-interval '12 months')::date AND data<=current_date GROUP BY 1,2),
prazos AS(SELECT CASE WHEN length(regexp_replace(coalesce(f.cpf_cnpj,''),'\D','','g'))=14 THEN left(regexp_replace(f.cpf_cnpj,'\D','','g'),8)
WHEN length(regexp_replace(coalesce(f.cpf_cnpj,''),'\D','','g'))=11 THEN regexp_replace(f.cpf_cnpj,'\D','','g') ELSE 'sem-cnpj:'||f.id::text END raiz_cnpj,
sum((t.dt_vencimento::date-t.dt_documento::date)*t.vl_titulo)/nullif(sum(t.vl_titulo),0) prazo_medio
FROM public.everest_titulos_fornecedor t JOIN public.everest_fornecedores f ON f.id=t.fornecedor_id
WHERE t.dt_documento::date>=(current_date-interval '12 months')::date AND t.dt_documento::date<=current_date AND t.vl_titulo>0 AND t.dt_vencimento>=t.dt_documento GROUP BY 1)
SELECT b.raiz_cnpj,max(b.fornecedor_nome) fornecedor_nome,sum(b.vl_total) gasto,
coalesce(k.gasto_exclusivo,0)/nullif(sum(b.vl_total),0) exclusividade,coalesce(k.pago_acima,0) pago_acima,k.inflacao,k.oscilacao,
coalesce(sum(b.vl_total) FILTER(WHERE nullif(trim(b.nr_pedido),'') IS NOT NULL AND trim(b.nr_pedido)!~'^0+$'),0)/nullif(sum(b.vl_total),0) com_pedido,
c.categoria,c.gasto/nullif(ct.gasto,0) peso_categoria,p.prazo_medio
FROM public.v_prisma_linhas b LEFT JOIN kpi k USING(raiz_cnpj) LEFT JOIN cats c ON c.raiz_cnpj=b.raiz_cnpj AND c.rn=1
LEFT JOIN public.v_prisma_categoria ct ON ct.categoria=c.categoria LEFT JOIN prazos p ON p.raiz_cnpj=b.raiz_cnpj
WHERE b.data>=(current_date-interval '12 months')::date AND b.data<=current_date
GROUP BY b.raiz_cnpj,k.gasto_exclusivo,k.pago_acima,k.inflacao,k.oscilacao,c.categoria,c.gasto,ct.gasto,p.prazo_medio;
REVOKE ALL ON public.v_prisma_linhas,public.v_prisma_item_fornecedor,public.v_prisma_comparacao,public.v_prisma_fornecedor,public.v_prisma_categoria FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.v_prisma_linhas,public.v_prisma_item_fornecedor,public.v_prisma_comparacao,public.v_prisma_fornecedor,public.v_prisma_categoria TO service_role;
CREATE FUNCTION public.compras_pode_plano(p_unit uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
SELECT CASE WHEN p_unit IS NOT NULL THEN public.kph_has_role_for_unit(p_unit)
ELSE coalesce((SELECT bool_and(public.kph_has_role_for_unit(unit_id)) FROM public.everest_unidades WHERE NOT fora_do_escopo_cmv AND unit_id IS NOT NULL),false) END $$;
CREATE TABLE public.compras_plano_acao(
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),unit_id uuid REFERENCES public.units(id),
tipo text NOT NULL,titulo text NOT NULL,alvo text NOT NULL,rs_em_jogo numeric(14,2) NOT NULL DEFAULT 0 CHECK(rs_em_jogo>=0),
dono text NOT NULL DEFAULT '',prazo date,status text NOT NULL DEFAULT 'aberta' CHECK(status IN ('aberta','em negociação','capturada','descartada')),
capturado_rs numeric(14,2) NOT NULL DEFAULT 0 CHECK(capturado_rs>=0),criado_por uuid NOT NULL REFERENCES auth.users(id),
criado_em timestamptz NOT NULL DEFAULT now(),atualizado_em timestamptz NOT NULL DEFAULT now(),
UNIQUE NULLS NOT DISTINCT(unit_id,tipo,alvo)
);
ALTER TABLE public.compras_plano_acao ENABLE ROW LEVEL SECURITY;
CREATE POLICY plano_ler ON public.compras_plano_acao FOR SELECT TO authenticated USING(public.compras_pode_plano(unit_id));
CREATE POLICY plano_servico ON public.compras_plano_acao FOR ALL TO service_role USING(true) WITH CHECK(true);
GRANT SELECT ON public.compras_plano_acao TO authenticated;
GRANT ALL ON public.compras_plano_acao TO service_role;
CREATE INDEX ON public.compras_plano_acao(unit_id,status,prazo);
NOTIFY pgrst,'reload schema';

