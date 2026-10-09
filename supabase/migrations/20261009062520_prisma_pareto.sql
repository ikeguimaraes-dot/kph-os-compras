-- Additive Compras models. Everest/Lorean remain read-only.
begin;
create table public.compras_prato_assinatura (
  unit_id uuid not null references public.units(id),
  produto_id uuid not null references public.produto_venda_ficha(id),
  marcado_por uuid not null references auth.users(id),
  em timestamptz not null default now(),
  primary key (unit_id, produto_id)
);
alter table public.compras_prato_assinatura enable row level security;
revoke all on public.compras_prato_assinatura from anon, authenticated;
grant select, insert, update, delete on public.compras_prato_assinatura to service_role;
comment on table public.compras_prato_assinatura is 'Assinatura por casa e produto da ponte. Server action valida identidade, papel, casa e vínculo antes de gravar; sem acesso direto do navegador.';

-- Include ALL confirmed dishes, even unsold/unpriced, when testing exclusivity.
create view public.v_pareto_uso with (security_invoker=true) as
select distinct p.unit_id, p.id produto_id, f.insumo_id
from public.produto_venda_ficha p
join public.v_ficha_explodida f on f.unit_id=p.unit_id and f.ficha_id=p.ficha_id
where p.status='confirmado';

create view public.v_pareto_insumo with (security_invoker=true) as
with usos as (
  select unit_id,insumo_id,array_agg(produto_id order by produto_id) pratos
  from public.v_pareto_uso group by 1,2
), compras as (
  select unit_id,item_id insumo_id,sum(gasto_12m) compra_12m,sum(q12) quantidade_12m,
    count(*) fornecedores,
    jsonb_agg(jsonb_build_object('raiz_cnpj',raiz_cnpj,'compra_12m',gasto_12m,'quantidade_12m',q12) order by raiz_cnpj) origens
  from public.v_mapa_share group by 1,2
)
select c.*, coalesce(i.descricao,'Item sem cadastro') nome,i.grupo categoria,i.unidade_medida,
  coalesce(u.pratos,'{}'::uuid[]) pratos,
  m.principal_90d,m.principal_12m,
  coalesce(m.principal_90d,m.principal_12m) principal,
  coalesce((select sum(s.q12) from public.v_mapa_share s
    where s.unit_id=c.unit_id and s.item_id=c.insumo_id
    and s.raiz_cnpj<>coalesce(m.principal_90d,m.principal_12m)),0) volume_equalizavel
from compras c left join public.everest_itens i on i.id=c.insumo_id
left join usos u using(unit_id,insumo_id)
left join public.v_mapa_insumo m using(unit_id,insumo_id);
comment on view public.v_pareto_insumo is 'Uma linha por casa/item Everest, agrupando fornecedores canônicos. Compra=sum(v_mapa_share.gasto_12m); equalização=sum(q12) fora do principal 90d (fallback 12m), em unidade do item. Potencial de concentração, não economia de preço.';

create view public.v_pareto_fornecedor with (security_invoker=true) as
with boletos as (
  select t.unit_id,coalesce(g.grupo_id,left(regexp_replace(f.cpf_cnpj,'\D','','g'),8)) raiz_cnpj,
    count(distinct t.id)::numeric/12 boletos_mes
  from public.everest_titulos_fornecedor t
  join public.everest_fornecedores f on f.id=t.fornecedor_id
  left join public.compras_fornecedor_grupo g on g.raiz_cnpj=left(regexp_replace(f.cpf_cnpj,'\D','','g'),8)
  where t.dt_lancamento between (current_date-interval '12 months')::date and current_date
    and t.ds_situacao not ilike '%cancel%' and t.ds_forma_pagamento ilike '%boleto%'
  group by 1,2
), dedicados as (
  -- A supplier with any unlinked/shared purchased item is NOT dedicated.
  select s.unit_id,s.raiz_cnpj,
    case when bool_and(cardinality(i.pratos)=1) and count(distinct i.pratos[1])=1
      then (array_agg(i.pratos[1]))[1] end produto_dedicado
  from public.v_mapa_share s
  join public.v_pareto_insumo i on i.unit_id=s.unit_id and i.insumo_id=s.item_id
  group by 1,2
)
select f.unit_id,f.raiz_cnpj,f.nome,f.gasto_12m,f.receita_atribuida,f.vencido,
  coalesce(b.boletos_mes,0) boletos_mes,d.produto_dedicado
from public.v_mapa_fornecedor f
left join boletos b using(unit_id,raiz_cnpj)
left join dedicados d using(unit_id,raiz_cnpj);
comment on view public.v_pareto_fornecedor is 'Raízes já unificadas pelo mapa; gasto Everest sem multiplicar por pratos. Dedicado: todos os itens comprados da raiz têm exatamente um mesmo prato confirmado. Boletos/mês: IDs distintos não cancelados explicitamente rotulados boleto, lançados em 12m / 12; média histórica, não baixa de dívida.';

create view public.v_pareto_prato with (security_invoker=true) as
with receita as (
  select unit_id,produto_venda_ficha_id produto_id,sum(receita_atribuida) receita_atribuida,
    bool_and(receita_atribuida is not null) atribuicao_completa
  from public.v_mapa_aresta group by 1,2
), exclusivos as (
  select u.unit_id,u.produto_id,count(*) insumos_exclusivos,
    coalesce(sum(i.compra_12m),0) compra_evitavel_12m,
    array_agg(u.insumo_id order by u.insumo_id) exclusivos_ids
  from public.v_pareto_uso u
  left join public.v_pareto_insumo i using(unit_id,insumo_id)
  where not exists (select 1 from public.v_pareto_uso outro
    where outro.unit_id=u.unit_id and outro.insumo_id=u.insumo_id and outro.produto_id<>u.produto_id)
  group by 1,2
), dedicados as (
  select unit_id,produto_dedicado produto_id,count(*) fornecedores_dedicados,
    sum(boletos_mes) boletos_mes
  from public.v_pareto_fornecedor where produto_dedicado is not null group by 1,2
)
select p.unit_id,p.id produto_id,p.nome_venda_original nome,p.receita_12m,
  r.receita_atribuida,coalesce(r.atribuicao_completa,false) atribuicao_completa,
  coalesce(e.insumos_exclusivos,0) insumos_exclusivos,
  coalesce(e.exclusivos_ids,'{}'::uuid[]) exclusivos_ids,
  coalesce(e.compra_evitavel_12m,0) compra_evitavel_12m,
  coalesce(d.fornecedores_dedicados,0) fornecedores_dedicados,coalesce(d.boletos_mes,0) boletos_mes,
  a.produto_id is not null assinatura
from public.produto_venda_ficha p
left join receita r on r.unit_id=p.unit_id and r.produto_id=p.id
left join exclusivos e on e.unit_id=p.unit_id and e.produto_id=p.id
left join dedicados d on d.unit_id=p.unit_id and d.produto_id=p.id
left join public.compras_prato_assinatura a on a.unit_id=p.unit_id and a.produto_id=p.id
where p.status='confirmado';
comment on view public.v_pareto_prato is 'Uma linha por prato confirmado/casa. Receita atribuída=sum(arestas), receita Lorean e peso/share Everest; valor incompleto não é zero nem cortável. Economia: compra 12m Everest de insumos exclusivos, uma vez por item; teto histórico, não lucro ou previsão.';

revoke all on public.v_pareto_uso,public.v_pareto_insumo,public.v_pareto_fornecedor,public.v_pareto_prato from anon,authenticated;
grant select on public.v_pareto_uso,public.v_pareto_insumo,public.v_pareto_fornecedor,public.v_pareto_prato to service_role;
commit;
