-- Prompt 12. Sources remain read-only. All reads go through scoped server actions.
CREATE VIEW public.v_pedido_estoque WITH (security_invoker=true) AS
WITH posicao AS (
 SELECT DISTINCT ON (v.unit_id,i.item_id,v.everest_cd_deposito)
 v.unit_id,i.item_id,v.everest_cd_deposito deposito_id,v.deposito,
 v.dt_inventario dia,i.quantidade_convertida quantidade,i.unidade_medida,
 v.id inventario_id,i.id inventario_item_id
 FROM public.everest_inventarios v
 JOIN public.everest_inventario_itens i ON i.inventario_id=v.id
 WHERE v.situacao='ENCERRADO' AND v.tipo IN ('ROTATIVO','GERAL')
 AND i.item_id IS NOT NULL AND v.dt_inventario <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
 ORDER BY v.unit_id,i.item_id,v.everest_cd_deposito,v.dt_inventario DESC,
 v.nr_inventario DESC,v.atualizado_em DESC,i.id
)
SELECT unit_id,item_id,
 CASE WHEN bool_and(quantidade IS NOT NULL) AND count(DISTINCT unidade_medida)=1
 THEN sum(quantidade) END quantidade,
 min(dia) posicao_de,max(dia) posicao_ate,max(unidade_medida) unidade_medida,
 'everest_inventario_itens.quantidade_convertida'::text fonte,
 true snapshot,
 jsonb_agg(jsonb_build_object('deposito',deposito,'dia',dia,'quantidade',quantidade,
 'inventario_id',inventario_id,'inventario_item_id',inventario_item_id) ORDER BY deposito_id) posicoes
FROM posicao GROUP BY unit_id,item_id;

CREATE VIEW public.v_pedido_venda_dow WITH (security_invoker=true) AS
WITH janela AS (
 SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date fim
), dias AS (
 SELECT fim-84+n dia FROM janela CROSS JOIN generate_series(0,83) n
), base AS MATERIALIZED (
 SELECT w.unit_id,w.data,upper(public.unaccent(trim(p.produto))) nome,
 sum(p.qtd) qtd,bool_and(p.qtd IS NOT NULL) completo
 FROM public.lorean_workdays w JOIN public.lorean_produtos_dia p ON p.workday_id_fk=w.id
 CROSS JOIN janela j WHERE w.data>=j.fim-84 AND w.data<j.fim
 GROUP BY 1,2,3
), cobertura AS MATERIALIZED (
 SELECT w.unit_id,w.data,bool_and(EXISTS(
 SELECT 1 FROM public.lorean_produtos_dia p WHERE p.workday_id_fk=w.id)) completo
 FROM public.lorean_workdays w CROSS JOIN janela j
 WHERE w.data>=j.fim-84 AND w.data<j.fim GROUP BY 1,2
)
SELECT b.unit_id,b.id produto_venda_ficha_id,b.ficha_id,b.nome_venda,
 extract(isodow FROM d.dia)::int dow,min(d.dia) inicio,max(d.dia) fim,
 count(*)::int dias_esperados,
 count(*) FILTER(WHERE c.completo AND coalesce(v.completo,true))::int dias_observados,
 CASE WHEN bool_and(coalesce(c.completo,false) AND coalesce(v.completo,true))
 THEN sum(coalesce(v.qtd,0))/12 END media_vendas,
 jsonb_agg(jsonb_build_object('dia',d.dia,'qtd',CASE WHEN c.completo AND coalesce(v.completo,true)
 THEN coalesce(v.qtd,0) END) ORDER BY d.dia) contas
FROM public.produto_venda_ficha b CROSS JOIN dias d
LEFT JOIN cobertura c ON c.unit_id=b.unit_id AND c.data=d.dia
LEFT JOIN base v ON v.unit_id=b.unit_id AND v.data=d.dia AND v.nome=b.nome_venda
WHERE b.status='confirmado'
GROUP BY b.unit_id,b.id,b.ficha_id,b.nome_venda,extract(isodow FROM d.dia);

CREATE VIEW public.v_pedido_consumo_dow WITH (security_invoker=true) AS
SELECT v.unit_id,f.insumo_id,v.dow,
 CASE WHEN bool_and(v.media_vendas IS NOT NULL AND f.quantidade IS NOT NULL AND f.quantidade>=0)
 THEN sum(v.media_vendas*f.quantidade) END consumo_medio,
 min(v.dias_observados) dias_observados,
 jsonb_agg(jsonb_build_object('produto_id',v.produto_venda_ficha_id,'nome',v.nome_venda,
 'media_vendas',v.media_vendas,'quantidade_ficha',f.quantidade,
 'consumo',v.media_vendas*f.quantidade) ORDER BY v.produto_venda_ficha_id) pratos
FROM public.v_pedido_venda_dow v JOIN public.v_ficha_explodida f
 ON f.unit_id=v.unit_id AND f.ficha_id=v.ficha_id
GROUP BY v.unit_id,f.insumo_id,v.dow;

-- One row per unified supplier group. Debt spans all houses, just as map credit does.
CREATE VIEW public.v_pedido_credito WITH (security_invoker=true) AS
WITH titulos AS (
 SELECT raiz_cnpj,sum(vl_saldo) em_aberto,
 coalesce(sum(vl_saldo) FILTER(WHERE dias_atraso>0),0) vencido,
 coalesce(sum(vl_saldo) FILTER(WHERE dias_atraso BETWEEN -7 AND 0),0) a_vencer_7d
 FROM public.v_mapa_titulo GROUP BY raiz_cnpj
), grupos AS (
 SELECT raiz_cnpj FROM public.v_mapa_fornecedor
 UNION SELECT raiz_cnpj FROM public.compras_fornecedor_credito
)
SELECT g.raiz_cnpj,coalesce(t.em_aberto,0) em_aberto,coalesce(t.vencido,0) vencido,
 coalesce(t.a_vencer_7d,0) a_vencer_7d,c.limite_rs,
 c.limite_rs-coalesce(t.em_aberto,0) disponivel
FROM grupos g LEFT JOIN titulos t USING(raiz_cnpj)
LEFT JOIN public.compras_fornecedor_credito c USING(raiz_cnpj);

CREATE TABLE public.compras_pedido_decisao (
 order_id uuid PRIMARY KEY REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
 unit_id uuid NOT NULL REFERENCES public.units(id),
 fornecedor_grupo text,
 cobertura_dias int NOT NULL CHECK(cobertura_dias BETWEEN 1 AND 90),
 limite_rs numeric,em_aberto_rs numeric,disponivel_rs numeric,
 total_rs numeric NOT NULL CHECK(total_rs>=0),
 excedeu boolean NOT NULL,
 confirmado_por uuid REFERENCES auth.users(id),confirmado_em timestamptz,
 criado_por uuid NOT NULL REFERENCES auth.users(id),criado_em timestamptz NOT NULL DEFAULT now(),
 itens jsonb NOT NULL,
 CHECK(NOT excedeu OR (confirmado_por IS NOT NULL AND confirmado_em IS NOT NULL))
);
ALTER TABLE public.compras_pedido_decisao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.compras_pedido_decisao FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.compras_pedido_decisao TO service_role;
CREATE POLICY pedido_decisao_servico ON public.compras_pedido_decisao TO service_role USING(true) WITH CHECK(true);
CREATE INDEX ON public.compras_pedido_decisao(unit_id,criado_em DESC);

-- Atomic creation: a rejected confirmation cannot leave an order or orphan audit.
-- Callable only by the server after checking session, role, unit and brand.
CREATE FUNCTION public.compras_pedido_criar(p_input jsonb,p_user uuid)
RETURNS public.purchase_orders LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE pedido public.purchase_orders; credito record; grupo text; total numeric;
 excedeu boolean:=false; limite numeric; aberto numeric; disponivel numeric;
BEGIN
 grupo:=nullif(p_input->>'fornecedor_grupo','');
 SELECT sum(round((i->>'quantidade')::numeric*(i->>'preco_unitario')::numeric,2))
 INTO total FROM jsonb_array_elements(p_input->'items') i;
 IF total IS NULL OR total<0 THEN RAISE EXCEPTION 'Pedido sem itens válidos'; END IF;
 IF grupo IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtext('pedido-credito:'||grupo));
  SELECT * INTO credito FROM public.v_pedido_credito WHERE raiz_cnpj=grupo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Grupo não encontrado'; END IF;
  limite:=credito.limite_rs; aberto:=credito.em_aberto; disponivel:=credito.disponivel;
  excedeu:=coalesce(total>disponivel,false);
  IF excedeu AND (coalesce((p_input->>'confirmar_excesso')::boolean,false)=false
    OR (p_input->>'disponivel_confirmado')::numeric IS DISTINCT FROM disponivel) THEN
   RAISE EXCEPTION 'Crédito excedido ou alterado. Atualize e confirme explicitamente o valor disponível.';
  END IF;
 END IF;
 INSERT INTO public.purchase_orders(unit_id,brand_id,fornecedor,supplier_id,data_pedido,data_prevista,observacoes,created_by)
 VALUES((p_input->>'unit_id')::uuid,(p_input->>'brand_id')::uuid,p_input->>'fornecedor',
 nullif(p_input->>'supplier_id','')::uuid,(p_input->>'data_pedido')::date,
 nullif(p_input->>'data_prevista','')::date,p_input->>'observacoes',p_user) RETURNING * INTO pedido;
 INSERT INTO public.purchase_order_items(order_id,nome,unidade,quantidade,preco_unitario)
 SELECT pedido.id,i->>'nome',i->>'unidade',(i->>'quantidade')::numeric,(i->>'preco_unitario')::numeric
 FROM jsonb_array_elements(p_input->'items') i;
 INSERT INTO public.compras_pedido_decisao(order_id,unit_id,fornecedor_grupo,cobertura_dias,
 limite_rs,em_aberto_rs,disponivel_rs,total_rs,excedeu,confirmado_por,confirmado_em,criado_por,itens)
 VALUES(pedido.id,pedido.unit_id,grupo,(p_input->>'cobertura_dias')::int,limite,aberto,disponivel,total,
 excedeu,CASE WHEN excedeu THEN p_user END,CASE WHEN excedeu THEN now() END,p_user,p_input->'items');
 SELECT * INTO pedido FROM public.purchase_orders WHERE id=pedido.id;
 RETURN pedido;
END $$;
REVOKE ALL ON FUNCTION public.compras_pedido_criar(jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.compras_pedido_criar(jsonb,uuid) TO service_role;
REVOKE ALL ON public.v_pedido_estoque,public.v_pedido_venda_dow,public.v_pedido_consumo_dow,public.v_pedido_credito FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.v_pedido_estoque,public.v_pedido_venda_dow,public.v_pedido_consumo_dow,public.v_pedido_credito TO service_role;
NOTIFY pgrst,'reload schema';
