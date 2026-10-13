-- v_mapa_compra_categoria: compra real 12 meses por casa / fornecedor / categoria.
-- Fonte: v_mapa_share (já aplica janela 12m, agrupamento de grupo e filtro vl_total>0)
-- × everest_itens (grupo → categoria). Sem estimativa, sem normalização proporcional.
begin;

create or replace view public.v_mapa_compra_categoria with (security_invoker = true) as
select
  s.unit_id,
  s.raiz_cnpj,
  coalesce(nullif(trim(i.grupo), ''), 'Sem categoria') as categoria,
  sum(s.gasto_12m)::numeric(18, 2)                    as compra_12m
from public.v_mapa_share s
left join public.everest_itens i on i.id = s.item_id
group by
  s.unit_id,
  s.raiz_cnpj,
  coalesce(nullif(trim(i.grupo), ''), 'Sem categoria');

comment on view public.v_mapa_compra_categoria is
  'Compra real 12 meses por casa/fornecedor/categoria. '
  'Fonte: v_mapa_share × everest_itens.grupo. '
  'Itens sem item_id ou sem grupo → ''Sem categoria''. '
  'Sem estimativa ou normalização proporcional.';

revoke all on public.v_mapa_compra_categoria from anon, authenticated;
grant select on public.v_mapa_compra_categoria to service_role;

commit;
