-- Compras owns these read models. Everest, Lorean and op_86 remain read-only.
begin;
create table public.compras_fornecedor_grupo (
  raiz_cnpj text primary key check (raiz_cnpj ~ '^[0-9]{8}$'),
  grupo_id text not null check (grupo_id ~ '^[0-9]{8}$')
);
create index compras_fornecedor_grupo_id_idx on public.compras_fornecedor_grupo(grupo_id);
insert into public.compras_fornecedor_grupo values
 ('31901640','31901640'),('48773957','31901640'),
 ('48547159','27470795'),('27470795','27470795');
comment on table public.compras_fornecedor_grupo is 'Raiz canônica apenas no mapa; cada raiz pertence a um único grupo. Empório Specialli não foi incluído sem confirmação.';

create table public.compras_fornecedor_credito (
  raiz_cnpj text primary key,
  limite_rs numeric(16,2) check (limite_rs >= 0),
  prazo_dias_acordado integer check (prazo_dias_acordado between 0 and 365),
  observacao text not null default '',
  atualizado_por uuid not null references auth.users(id),
  atualizado_em timestamptz not null default now()
);
alter table public.compras_fornecedor_grupo enable row level security;
alter table public.compras_fornecedor_credito enable row level security;
revoke all on public.compras_fornecedor_grupo, public.compras_fornecedor_credito from anon, authenticated;
grant all on public.compras_fornecedor_grupo, public.compras_fornecedor_credito to service_role;
-- Existing pattern: server actions authorize identity, role and unit before service access.
update public.compras_fornecedor_apelido
set apelido = regexp_replace(apelido, '(\s+(de|da|do|das|dos|e))+$', '', 'i'), atualizado_em=now()
where origem='auto' and apelido ~* '\s+(de|da|do|das|dos|e)$';

create view public.v_mapa_compra with (security_invoker=true) as
select b.*, coalesce(g.grupo_id,b.raiz_cnpj) as fornecedor_grupo
from public.v_compra_cmv_base b
left join public.compras_fornecedor_grupo g on g.raiz_cnpj=b.raiz_cnpj
where b.data between (current_date-interval '12 months')::date and current_date
  and b.vl_total>0 and b.vl_unitario>0 and b.quantidade>0;

create view public.v_mapa_share with (security_invoker=true) as
with s as (
 select unit_id,item_id,fornecedor_grupo raiz_cnpj,max(fornecedor_nome) fornecedor_nome,
 sum(quantidade) q12,coalesce(sum(quantidade) filter(where data>=current_date-90),0) q90,
 max(data) ultima_compra, sum(vl_total) gasto_12m
 from public.v_mapa_compra group by 1,2,3
)
select s.*,q12/nullif(sum(q12) over(partition by unit_id,item_id),0) share_12m,
 q90/nullif(sum(q90) over(partition by unit_id,item_id),0) share_90d
from s;

create view public.v_mapa_insumo with (security_invoker=true) as
with principais as (
 select unit_id,item_id,
 (array_agg(raiz_cnpj order by q12 desc,raiz_cnpj))[1] principal_12m,
 (array_agg(raiz_cnpj order by q90 desc,raiz_cnpj) filter(where q90>0))[1] principal_90d,
 max(ultima_compra) ultima_compra
 from public.v_mapa_share group by 1,2
), reservas as (
 select item_id, count(distinct raiz_cnpj) fornecedores_grupo from public.v_mapa_share group by 1
), homologadas as (
 -- A brand listed in the imported spreadsheet is NOT an approved alternative.
 select m.item_id,count(distinct (c.distribuidor,c.marca)) alternativas
 from public.compras_matriz_marcas m join public.compras_cotacao_distribuidor c on c.matriz_id=m.id
 where c.homologado and (c.validade is null or c.validade>=current_date) and m.item_id is not null
 group by 1
)
select p.unit_id,p.item_id insumo_id,i.descricao nome,i.grupo categoria,
 p.principal_90d,p.principal_12m,
 (p.principal_90d is not null and p.principal_90d<>p.principal_12m) fornecedor_trocou,
 p.ultima_compra,greatest(r.fornecedores_grupo-1,0) fornecedores_reserva,
 coalesce(h.alternativas,0) alternativas_homologadas,
 greatest(r.fornecedores_grupo-1,0)+coalesce(h.alternativas,0) reserva
from principais p join public.everest_itens i on i.id=p.item_id
join reservas r on r.item_id=p.item_id left join homologadas h on h.item_id=p.item_id;

create view public.v_mapa_aresta with (security_invoker=true) as
with custos as materialized (
 select f.unit_id,f.ficha_id,f.insumo_id,f.quantidade*p.preco_medio custo,
 sum(f.quantidade*p.preco_medio) over(partition by f.unit_id,f.ficha_id) custo_total,
 bool_and(p.preco_medio>0 and f.quantidade>=0 and p.preco_medio is not null)
   over(partition by f.unit_id,f.ficha_id) custo_completo
 from public.v_ficha_explodida f left join public.v_preco_medio_compra p
 on p.unit_id=f.unit_id and p.item_id=f.insumo_id
)
select b.unit_id,s.raiz_cnpj,c.insumo_id,b.id produto_venda_ficha_id,
 b.nome_venda_original prato,b.receita_12m,
 b.receita_12m / ((current_date-(current_date-interval '12 months')::date)::numeric/7) receita_semana,
 c.custo/nullif(c.custo_total,0) peso_custo,s.share_12m share_fornecedor,
 b.receita_12m*c.custo/nullif(c.custo_total,0)*s.share_12m receita_atribuida,
 c.custo/nullif(c.custo_total,0)>=0.15 critico,
 i.nome insumo,i.categoria,i.reserva,i.ultima_compra,i.principal_90d,i.principal_12m,i.fornecedor_trocou
from public.produto_venda_ficha b join custos c on c.unit_id=b.unit_id and c.ficha_id=b.ficha_id
join public.v_mapa_share s on s.unit_id=c.unit_id and s.item_id=c.insumo_id
join public.v_mapa_insumo i on i.unit_id=c.unit_id and i.insumo_id=c.insumo_id
where b.status='confirmado' and b.receita_12m>0 and c.custo_completo and c.custo_total>0 and c.custo>0;
comment on view public.v_mapa_aresta is 'Receita atribuída = receita 12m da ponte confirmada × peso de custo completo Everest × share de quantidade 12m da raiz unificada. Receita semanal = média 12m, prévia; não previsão. Criticidade padrão 15%, ajustável na aplicação por prisma-config.';

create view public.v_mapa_titulo with (security_invoker=true) as
select t.id,t.unit_id,coalesce(g.grupo_id,left(regexp_replace(f.cpf_cnpj,'\D','','g'),8)) raiz_cnpj,
 t.dt_vencimento,t.vl_saldo,t.nr_nota,t.ds_parcela,
 (t.nr_nota is null and coalesce(t.ds_parcela,'') ~ '^\s*[0-9]+\s*/\s*[0-9]+\s*$') acordo,
 current_date-t.dt_vencimento dias_atraso
from public.everest_titulos_fornecedor t
join public.everest_fornecedores f on f.id=t.fornecedor_id
left join public.compras_fornecedor_grupo g on g.raiz_cnpj=left(regexp_replace(f.cpf_cnpj,'\D','','g'),8)
where t.ds_situacao='Ativo' and t.vl_saldo>0;
comment on view public.v_mapa_titulo is 'Uma linha por título id. Junções por PK, nunca por nome/raiz do cadastro duplicado. A conciliar é subconjunto de vencido (>120 dias), não somar novamente.';

create view public.v_mapa_fornecedor with (security_invoker=true) as
with compras as (
 select unit_id,fornecedor_grupo raiz_cnpj,max(fornecedor_nome) nome,sum(vl_total) gasto_12m
 from public.v_mapa_compra group by 1,2
), vendas as (
 select unit_id,raiz_cnpj,sum(receita_atribuida) receita_atribuida,count(distinct produto_venda_ficha_id) pratos_dependentes
 from public.v_mapa_aresta group by 1,2
), titulos as (
 select unit_id,raiz_cnpj,sum(vl_saldo) em_aberto,
 coalesce(sum(vl_saldo) filter(where dias_atraso>0),0) vencido,
 coalesce(sum(vl_saldo) filter(where dias_atraso<=0),0) a_vencer,
 coalesce(sum(vl_saldo) filter(where dias_atraso>120),0) a_conciliar
 from public.v_mapa_titulo group by 1,2
), universo as (
 select unit_id,raiz_cnpj from compras union select unit_id,raiz_cnpj from titulos
), prato as (
 select unit_id,sum(receita_12m) receita_total,count(*) filter(where receita_12m>0) pratos_vendidos
 from public.produto_venda_ficha group by 1
), metrics as (
 select u.unit_id,u.raiz_cnpj,coalesce(ap.apelido,c.nome,u.raiz_cnpj) nome,
 coalesce(c.gasto_12m,0) gasto_12m,
 coalesce(c.gasto_12m,0)/nullif(sum(c.gasto_12m) over(partition by u.unit_id),0) pct_compras_casa,
 sum(coalesce(c.gasto_12m,0)) over(partition by u.raiz_cnpj)/nullif(sum(c.gasto_12m) over(),0) pct_compras_grupo,
 dense_rank() over(partition by u.unit_id order by coalesce(c.gasto_12m,0) desc) ranking,
 count(*) over(partition by u.unit_id) fornecedores_total,
 coalesce(v.receita_atribuida,0) receita_atribuida,
 coalesce(v.receita_atribuida,0)/nullif(p.receita_total,0) pct_receita,
 coalesce(v.pratos_dependentes,0) pratos_dependentes,p.pratos_vendidos,p.receita_total,
 coalesce(t.em_aberto,0) em_aberto,coalesce(t.vencido,0) vencido,coalesce(t.a_vencer,0) a_vencer,coalesce(t.a_conciliar,0) a_conciliar
 from universo u left join compras c using(unit_id,raiz_cnpj) left join vendas v using(unit_id,raiz_cnpj)
 left join titulos t using(unit_id,raiz_cnpj) left join prato p on p.unit_id=u.unit_id
 left join public.compras_fornecedor_apelido ap on ap.raiz_cnpj=u.raiz_cnpj
), total_credito as (
 select raiz_cnpj,sum(em_aberto) aberto_grupo from titulos group by 1
)
select m.*,cr.limite_rs,cr.prazo_dias_acordado,
 cr.limite_rs-coalesce(tc.aberto_grupo,0) disponivel
from metrics m left join public.compras_fornecedor_credito cr using(raiz_cnpj)
left join total_credito tc using(raiz_cnpj);

revoke all on public.v_mapa_compra,public.v_mapa_share,public.v_mapa_insumo,
 public.v_mapa_aresta,public.v_mapa_titulo,public.v_mapa_fornecedor from anon,authenticated;
grant select on public.v_mapa_compra,public.v_mapa_share,public.v_mapa_insumo,
 public.v_mapa_aresta,public.v_mapa_titulo,public.v_mapa_fornecedor to service_role;
commit;
