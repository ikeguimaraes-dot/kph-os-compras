-- Evaluate the recipe tree once per query, preserving confirmed use and invalid-recipe exclusions.
begin;
create or replace view public.v_pareto_uso with (security_invoker=true) as
with arvore as materialized (
  select unit_id,ficha_id,insumo_id,subficha,ciclo,profundidade
  from public.v_ficha_arvore
), invalidas as (
  select distinct unit_id,ficha_id from arvore
  where ciclo or (profundidade=6 and subficha)
)
select distinct p.unit_id,p.id produto_id,t.insumo_id
from public.produto_venda_ficha p
join arvore t on t.unit_id=p.unit_id and t.ficha_id=p.ficha_id
where p.status='confirmado' and not t.subficha and not t.ciclo
  and not exists(select 1 from invalidas i where i.unit_id=t.unit_id and i.ficha_id=t.ficha_id);
comment on view public.v_pareto_uso is 'Uso dos insumos por todos os pratos confirmados, inclusive sem preço/venda. Árvore calculada uma vez por consulta; mesmas exclusões de ciclos e profundidade de v_ficha_explodida. Sem snapshot ou escrita nas fontes.';
revoke all on public.v_pareto_uso from anon,authenticated;
grant select on public.v_pareto_uso to service_role;
commit;
