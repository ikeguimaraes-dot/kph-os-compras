-- Read-only planning: raw sales in three nested windows. Not an order generator.
-- The application checks authenticated unit access before calling this service-only RPC.
CREATE FUNCTION public.compras_planejamento_vendas(p_unit_ids uuid[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
WITH cutoff AS (
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS today
), scope AS MATERIALIZED (
  SELECT u.id,u.name FROM public.units u
  WHERE u.id = ANY(p_unit_ids) AND u.active AND u.lorean_code IS NOT NULL
), workdays AS MATERIALIZED (
  SELECT w.id,w.unit_id,w.data,w.qualidade_suspeito
  FROM public.lorean_workdays w JOIN scope s ON s.id=w.unit_id CROSS JOIN cutoff c
  WHERE w.data>=c.today-84 AND w.data<c.today
), daily AS MATERIALIZED (
  SELECT w.unit_id,w.data,upper(public.unaccent(trim(p.produto))) AS key,
    max(p.produto) AS name,max(p.grupo) AS category,
    CASE WHEN bool_and(p.qtd IS NOT NULL AND p.qtd>=0 AND NOT coalesce(w.qualidade_suspeito,false))
      THEN sum(p.qtd) END AS qty
  FROM workdays w JOIN public.lorean_produtos_dia p ON p.workday_id_fk=w.id
  GROUP BY w.unit_id,w.data,upper(public.unaccent(trim(p.produto)))
), day_quality AS MATERIALIZED (
  SELECT w.unit_id,w.data,
    bool_and(NOT coalesce(w.qualidade_suspeito,false) AND EXISTS (
      SELECT 1 FROM public.lorean_produtos_dia p WHERE p.workday_id_fk=w.id
    )) AS observed
  FROM workdays w GROUP BY w.unit_id,w.data
), units AS (
  SELECT s.id,s.name,
    count(*) FILTER(WHERE q.observed AND q.data>=c.today-28) AS days4,
    count(*) FILTER(WHERE q.observed AND q.data>=c.today-56) AS days8,
    count(*) FILTER(WHERE q.observed) AS days12,max(q.data) AS latest
  FROM scope s CROSS JOIN cutoff c LEFT JOIN day_quality q ON q.unit_id=s.id
  GROUP BY s.id,s.name
), events AS MATERIALIZED (
  SELECT r.unit_id,upper(public.unaccent(trim(o.produto_nome))) AS key,
    count(DISTINCT r.data) FILTER(WHERE NOT coalesce(o.observacao ~ '^85',false)) AS days86,
    count(DISTINCT r.data) FILTER(WHERE o.observacao ~ '^85') AS days85
  FROM public.op_86 o JOIN public.op_relatorio_diario r ON r.id=o.relatorio_id
  JOIN scope s ON s.id=r.unit_id CROSS JOIN cutoff c
  WHERE r.data>=c.today-84 AND r.data<c.today GROUP BY 1,2
), product_totals AS MATERIALIZED (
  SELECT d.unit_id,d.key,max(d.name) AS name,max(d.category) AS category,
    min(d.data) AS first_sale,
    CASE WHEN bool_and(d.qty IS NOT NULL) FILTER(WHERE d.data>=c.today-28)
      THEN coalesce(sum(d.qty) FILTER(WHERE d.data>=c.today-28),0)/4.0
      WHEN count(*) FILTER(WHERE d.data>=c.today-28)=0 THEN 0 END AS w4,
    CASE WHEN bool_and(d.qty IS NOT NULL) FILTER(WHERE d.data>=c.today-56)
      THEN coalesce(sum(d.qty) FILTER(WHERE d.data>=c.today-56),0)/8.0
      WHEN count(*) FILTER(WHERE d.data>=c.today-56)=0 THEN 0 END AS w8,
    CASE WHEN bool_and(d.qty IS NOT NULL) THEN sum(d.qty)/12.0 END AS w12,
    coalesce(sum(d.qty),0) AS total12
  FROM daily d CROSS JOIN cutoff c GROUP BY d.unit_id,d.key
), dow_totals AS (
  SELECT d.unit_id,d.key,extract(isodow FROM d.data)::int AS dow,
    coalesce(sum(d.qty) FILTER(WHERE d.data>=c.today-28),0)/4.0 AS w4,
    coalesce(sum(d.qty) FILTER(WHERE d.data>=c.today-56),0)/8.0 AS w8,
    sum(d.qty)/12.0 AS w12
  FROM daily d CROSS JOIN cutoff c GROUP BY d.unit_id,d.key,extract(isodow FROM d.data)
), weekdays AS (
  SELECT unit_id,key,jsonb_agg(jsonb_build_object('dow',dow,'w4',w4,'w8',w8,'w12',w12) ORDER BY dow) AS weekdays
  FROM dow_totals GROUP BY unit_id,key
), products AS MATERIALIZED (
  SELECT p.*,b.ficha_id,coalesce(b.status='confirmado',false) AS confirmed,
    coalesce(e.days86,0) AS days86,coalesce(e.days85,0) AS days85,w.weekdays
  FROM product_totals p
  LEFT JOIN public.produto_venda_ficha b ON b.unit_id=p.unit_id AND b.nome_venda=p.key
  LEFT JOIN events e ON e.unit_id=p.unit_id AND e.key=p.key
  LEFT JOIN weekdays w ON w.unit_id=p.unit_id AND w.key=p.key
), recipes AS (
  SELECT f.unit_id,f.ficha_id,f.insumo_id AS item_id,i.descricao AS name,
    i.unidade_medida AS measure,f.quantidade AS quantity
  FROM public.v_ficha_explodida f JOIN public.everest_itens i ON i.id=f.insumo_id
  WHERE EXISTS(SELECT 1 FROM products p WHERE p.confirmed AND p.ficha_id=f.ficha_id AND p.unit_id=f.unit_id)
), stock AS (
  SELECT e.unit_id,e.item_id,e.quantidade AS quantity,e.unidade_medida AS measure,
    e.posicao_de AS "from",e.posicao_ate AS "to"
  FROM public.v_pedido_estoque e JOIN scope s ON s.id=e.unit_id
)
SELECT jsonb_build_object(
  'as_of',(SELECT today FROM cutoff),
  'units',coalesce((SELECT jsonb_agg(u ORDER BY name) FROM units u),'[]'::jsonb),
  'products',coalesce((SELECT jsonb_agg(p ORDER BY total12 DESC,key) FROM products p),'[]'::jsonb),
  'recipes',coalesce((SELECT jsonb_agg(r) FROM recipes r),'[]'::jsonb),
  'stock',coalesce((SELECT jsonb_agg(s) FROM stock s),'[]'::jsonb)
);
$function$;
REVOKE ALL ON FUNCTION public.compras_planejamento_vendas(uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.compras_planejamento_vendas(uuid[]) TO service_role;
COMMENT ON FUNCTION public.compras_planejamento_vendas(uuid[]) IS
  'Vendas Lorean 4/8/12 semanas; médias brutas por semana calendário. 86 sinalizado, sem correção automática. Sem criação de pedidos.';
NOTIFY pgrst,'reload schema';
