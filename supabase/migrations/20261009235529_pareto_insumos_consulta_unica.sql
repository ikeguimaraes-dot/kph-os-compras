begin;
create or replace view public.v_pareto_insumo with (security_invoker=true) as
with shares as materialized (
  select unit_id,item_id,raiz_cnpj,gasto_12m,q12,q90 from public.v_mapa_share
), usos as (
  select unit_id,insumo_id,array_agg(produto_id order by produto_id) pratos
  from public.v_pareto_uso group by 1,2
), compras as (
  select unit_id,item_id insumo_id,sum(gasto_12m) compra_12m,sum(q12) quantidade_12m,
    count(*) fornecedores,
    jsonb_agg(jsonb_build_object('raiz_cnpj',raiz_cnpj,'compra_12m',gasto_12m,'quantidade_12m',q12) order by raiz_cnpj) origens
  from shares group by 1,2
), principais as (
  select unit_id,item_id insumo_id,
    (array_agg(raiz_cnpj order by q12 desc,raiz_cnpj))[1] principal_12m,
    (array_agg(raiz_cnpj order by q90 desc,raiz_cnpj) filter(where q90>0))[1] principal_90d
  from shares group by 1,2
)
select c.*,coalesce(i.descricao,'Item sem cadastro') nome,i.grupo categoria,i.unidade_medida,
  coalesce(u.pratos,'{}'::uuid[]) pratos,m.principal_90d,m.principal_12m,
  coalesce(m.principal_90d,m.principal_12m) principal,
  coalesce(c.quantidade_12m-s.q12,0) volume_equalizavel
from compras c left join public.everest_itens i on i.id=c.insumo_id
left join usos u using(unit_id,insumo_id)
left join principais m using(unit_id,insumo_id)
left join shares s on s.unit_id=c.unit_id and s.item_id=c.insumo_id
  and s.raiz_cnpj=coalesce(m.principal_90d,m.principal_12m);
comment on view public.v_pareto_insumo is 'Uma linha por casa/item; compras e principal calculados uma vez por consulta. Equalização = quantidade total menos quantidade do principal 90d (fallback 12m). Mesmos valores e desempate de v_mapa_insumo; fontes somente leitura.';
revoke all on public.v_pareto_insumo from anon,authenticated;
grant select on public.v_pareto_insumo to service_role;
commit;
