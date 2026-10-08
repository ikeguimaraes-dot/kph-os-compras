-- Prisma v2. Only owned tables and read models; source ledgers remain unchanged.
create table public.compras_metas (
 unit_id uuid not null references public.units(id), mes date not null,
 cmv_meta_pct numeric check(cmv_meta_pct between 0 and 100),
 economia_meta_rs numeric check(economia_meta_rs>=0),
 atualizado_por uuid references auth.users(id), atualizado_em timestamptz not null default now(),
 primary key(unit_id,mes), check(extract(day from mes)=1)
);
create table public.compras_fornecedor_apelido (
 raiz_cnpj text primary key, apelido text not null check(length(trim(apelido)) between 1 and 120),
 atualizado_por uuid references auth.users(id), atualizado_em timestamptz not null default now()
);
alter table public.compras_metas enable row level security;
alter table public.compras_fornecedor_apelido enable row level security;
revoke all on public.compras_metas,public.compras_fornecedor_apelido from anon,authenticated;
grant all on public.compras_metas,public.compras_fornecedor_apelido to service_role;
create policy metas_servico on public.compras_metas for all to service_role using(true) with check(true);
create policy apelidos_servico on public.compras_fornecedor_apelido for all to service_role using(true) with check(true);
insert into public.compras_fornecedor_apelido(raiz_cnpj,apelido)
select raiz_cnpj,left(initcap(lower(max(fornecedor_nome))),120) from public.v_prisma_linhas group by 1;
alter table public.compras_plano_acao add column capturado_em date;
comment on column public.compras_plano_acao.capturado_em is 'Data efetiva informada da captura; não inferir de criado_em/atualizado_em.';

create materialized view public.mv_prisma_compra_mes as
select unit_id,mes,item_id,raiz_cnpj,max(fornecedor_nome) fornecedor_nome,
 max(item_nome) item_nome,max(unidade) unidade,max(categoria) categoria,
 sum(vl_total) comprado_rs,
 sum(vl_total) filter(where vl_unitario>0 and vl_total>0) valor_precificado,
 sum(quantidade) filter(where vl_unitario>0 and vl_total>0) quantidade,
 sum(vl_total) filter(where nullif(trim(nr_pedido),'') is not null and trim(nr_pedido)<>'0') com_pedido_rs
from public.v_prisma_linhas group by 1,2,3,4 with no data;
create index on public.mv_prisma_compra_mes(unit_id,mes);
create index on public.mv_prisma_compra_mes(unit_id,item_id,mes);
create view public.v_prisma_preco_mes as
select unit_id,mes,item_id,sum(valor_precificado)/nullif(sum(quantidade),0) preco_medio,
 sum(quantidade) quantidade,sum(comprado_rs) comprado_rs
from public.mv_prisma_compra_mes where item_id is not null group by 1,2,3;
create materialized view public.mv_prisma_ficha_insumo as
select * from public.v_ficha_explodida with no data;
create unique index on public.mv_prisma_ficha_insumo(unit_id,ficha_id,insumo_id);
create materialized view public.mv_prisma_venda_mes as
select w.unit_id,date_trunc('month',w.data::timestamp)::date mes,
 upper(public.unaccent(trim(p.produto))) nome_venda,max(p.produto) nome,
 coalesce(nullif(max(p.grupo),''),'Sem grupo') grupo,sum(p.qtd) qtd,sum(p.total) receita
from public.lorean_produtos_dia p join public.lorean_workdays w on w.id=p.workday_id_fk
group by 1,2,3 with no data;
create unique index on public.mv_prisma_venda_mes(unit_id,mes,nome_venda);
create materialized view public.mv_prisma_prato_mes as
select v.*,b.ficha_id,b.status status_ponte,
 case when b.status='confirmado' and count(f.insumo_id)>0 and
 bool_and(p.preco_medio is not null and p.preco_medio>0 and f.quantidade>=0)
 then sum(f.quantidade*p.preco_medio) end custo_unitario,
 count(f.insumo_id) insumos,count(p.preco_medio) insumos_precificados
from public.mv_prisma_venda_mes v
left join public.produto_venda_ficha b on b.unit_id=v.unit_id and b.nome_venda=v.nome_venda
left join public.mv_prisma_ficha_insumo f on b.status='confirmado' and f.unit_id=b.unit_id and f.ficha_id=b.ficha_id
left join public.v_prisma_preco_mes p on p.unit_id=f.unit_id and p.item_id=f.insumo_id and p.mes=v.mes
group by v.unit_id,v.mes,v.nome_venda,v.nome,v.grupo,v.qtd,v.receita,b.ficha_id,b.status with no data;
create unique index on public.mv_prisma_prato_mes(unit_id,mes,nome_venda);

-- Closing stock: completed, whole-depot ROTATIVO/GERAL counts only. AJUSTE is a
-- stock adjustment, not a second count. No reuse of a partial category count.
-- quantidade_convertida is in the base unit; custo_api must price that same unit.
create view public.v_prisma_estoque_fechamento as
with latest as (
 select distinct on(unit_id,dt_inventario,everest_cd_deposito) *
 from public.everest_inventarios
 where situacao='ENCERRADO' and tipo in('ROTATIVO','GERAL') and nullif(trim(grupo),'') is null
 order by unit_id,dt_inventario,everest_cd_deposito,atualizado_em desc,id desc
)
select v.unit_id,v.dt_inventario dia,array_agg(distinct v.everest_cd_deposito order by v.everest_cd_deposito) depositos,
 sum(i.quantidade_convertida*i.custo_api) estoque_rs,
 bool_and(i.quantidade_convertida is not null and i.custo_api is not null and
 (i.custo_api>0 or i.quantidade_convertida=0)) and count(i.id)>0 and bool_or(i.custo_api>0) custo_completo
from latest v left join public.everest_inventario_itens i on i.inventario_id=v.id
group by 1,2;
create view public.v_prisma_margem_mes as
with calendario as (
 select u.unit_id,d::date mes from public.everest_unidades u
 cross join generate_series(date_trunc('month',(now() at time zone 'America/Sao_Paulo'))-interval '35 months',
 date_trunc('month',(now() at time zone 'America/Sao_Paulo')),interval '1 month') d
 where not u.fora_do_escopo_cmv
), compra as(select unit_id,mes,sum(comprado_rs) comprado_rs from public.mv_prisma_compra_mes group by 1,2),
venda as(select unit_id,mes,sum(receita) receita,
 sum(receita) filter(where status_ponte='confirmado') receita_confirmada,
 sum(receita) filter(where custo_unitario is not null) receita_coberta,
 sum(qtd*custo_unitario) filter(where custo_unitario is not null) custo_teorico_rs
 from public.mv_prisma_prato_mes group by 1,2)
select c.unit_id,c.mes,coalesce(p.comprado_rs,0) comprado_rs,coalesce(v.receita,0) receita,
 coalesce(v.receita_confirmada,0) receita_confirmada,coalesce(v.receita_coberta,0) receita_coberta,
 v.custo_teorico_rs,
 case when ei.custo_completo and ef.custo_completo and ei.depositos=ef.depositos
 then ei.estoque_rs+coalesce(p.comprado_rs,0)-ef.estoque_rs else coalesce(p.comprado_rs,0) end cmv_real_rs,
 case when ei.custo_completo and ef.custo_completo and ei.depositos=ef.depositos then 'inventario' else 'proxy' end metodo,
 ei.estoque_rs estoque_inicial_rs,ef.estoque_rs estoque_final_rs,
 coalesce(mt.cmv_meta_pct,om.valor) cmv_meta_pct,mt.economia_meta_rs
from calendario c left join compra p using(unit_id,mes) left join venda v using(unit_id,mes)
left join public.v_prisma_estoque_fechamento ei on ei.unit_id=c.unit_id and ei.dia=c.mes-1
left join public.v_prisma_estoque_fechamento ef on ef.unit_id=c.unit_id and ef.dia=(c.mes+interval '1 month -1 day')::date
left join public.compras_metas mt on mt.unit_id=c.unit_id and mt.mes=c.mes
left join lateral (select valor from public.op_meta_indicador
 where unit_id=c.unit_id and competencia=to_char(c.mes,'YYYY-MM') and indicador='cmv_pct'
 order by updated_at desc limit 1) om on true;

-- Candidate alerts: configurable thresholds are applied by prisma-config.ts.
create view public.v_prisma_alertas as
with recentes as(select * from public.v_prisma_linhas where data>=(now() at time zone 'America/Sao_Paulo')::date-6),
precos as(select r.*,p.preco_media from recentes r left join lateral(
 select sum(vl_total)/nullif(sum(quantidade),0) preco_media from public.v_prisma_linhas h
 where h.unit_id=r.unit_id and h.item_id=r.item_id and h.data>=r.data-90 and h.data<r.data
 and h.vl_unitario>0 and h.vl_total>0) p on true),
consumo as(select v.unit_id,v.mes,f.insumo_id,sum(v.qtd*f.quantidade) qtd
 from public.mv_prisma_prato_mes v join public.mv_prisma_ficha_insumo f on f.unit_id=v.unit_id and f.ficha_id=v.ficha_id
 where v.status_ponte='confirmado' and v.mes=date_trunc('month',(now() at time zone 'America/Sao_Paulo'))::date group by 1,2,3),
notas as(select n.unit_id,n.id,n.fornecedor_id,(n.dh_emissao at time zone 'America/Sao_Paulo')::date data,n.vl_total,
 f.nome_fantasia nome,avg(n.vl_total) over(partition by n.unit_id,n.fornecedor_id order by n.dh_emissao rows between unbounded preceding and 1 preceding) media
 from public.everest_notas_recebidas n left join public.everest_fornecedores f on f.id=n.fornecedor_id)
select unit_id,data,'preco'::text tipo,item_nome titulo,id::text alvo,vl_unitario valor,preco_media referencia,
 null::uuid outra_unit_id,'Comparar unidade e embalagem antes de negociar.'::text detalhe
from precos where vl_unitario>preco_media
union all select unit_id,data,'sem_pedido',item_nome,id::text,vl_total,null,null,'Proteína comprada sem número de pedido na nota.'
from recentes where public.unaccent(categoria) ilike '%proteina%' and (nullif(trim(nr_pedido),'') is null or trim(nr_pedido)='0')
union all select unit_id,min(data),'novo_fornecedor',max(fornecedor_nome),raiz_cnpj,sum(vl_total),null,null,'Primeira compra registrada na casa.'
from public.v_prisma_linhas group by unit_id,raiz_cnpj having min(data)>=(now() at time zone 'America/Sao_Paulo')::date-6
union all select unit_id,data,'nota_alta',coalesce(nome,'Fornecedor'),id::text,vl_total,media,null,'Nota acima do histórico; conferir volume e frequência.'
from notas where data>=(now() at time zone 'America/Sao_Paulo')::date-6 and vl_total>media
union all select unit_id,mes,'sem_ficha',nome,nome_venda,receita,null,null,'Receita do mês sem ficha confirmada.'
from public.mv_prisma_prato_mes where status_ponte is distinct from 'confirmado'
 and mes=date_trunc('month',(now() at time zone 'America/Sao_Paulo'))::date
union all select c.unit_id,c.mes,'consumo_maior_compra',i.descricao,c.insumo_id::text,c.qtd,coalesce(p.quantidade,0),outro.unit_id,
 'Consumo teórico maior que a compra na casa. Investigar estoque, unidade, nota ou transferência; não comprova perda.'
from consumo c left join public.v_prisma_preco_mes p on p.unit_id=c.unit_id and p.item_id=c.insumo_id and p.mes=c.mes
join public.everest_itens i on i.id=c.insumo_id
left join lateral(select unit_id from public.v_prisma_preco_mes x where x.item_id=c.insumo_id and x.mes=c.mes and x.unit_id<>c.unit_id and x.quantidade>0 order by quantidade desc limit 1)outro on true
where c.qtd>coalesce(p.quantidade,0);

create or replace function public.atualizar_prisma_cockpit() returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare log_id bigint;
begin
 perform pg_advisory_xact_lock(hashtext('prisma-cockpit-refresh'));
 insert into public.prisma_refresh_log(etapa) values('cockpit') returning id into log_id;
 begin
  perform public.atualizar_ancoras_diaria();
  refresh materialized view public.mv_prisma_compra_mes;
  refresh materialized view public.mv_prisma_ficha_insumo;
  refresh materialized view public.mv_prisma_venda_mes;
  refresh materialized view public.mv_prisma_prato_mes;
  update public.prisma_refresh_log set concluido_em=now() where id=log_id;
 exception when others then
  update public.prisma_refresh_log set concluido_em=now(),erro=sqlerrm where id=log_id;
 end;
end $$;
revoke all on function public.atualizar_prisma_cockpit() from public,anon,authenticated;
grant execute on function public.atualizar_prisma_cockpit() to service_role;
do $$declare rel text;begin
 foreach rel in array array['mv_prisma_compra_mes','v_prisma_preco_mes','mv_prisma_ficha_insumo','mv_prisma_venda_mes','mv_prisma_prato_mes','v_prisma_estoque_fechamento','v_prisma_margem_mes','v_prisma_alertas'] loop
 execute format('revoke all on public.%I from anon,authenticated',rel);
 execute format('grant select on public.%I to service_role',rel);
 end loop;
end $$;
do $$declare jid bigint;begin
 select jobid into jid from cron.job where jobname='prisma-ancoras-diaria';
 if jid is not null then perform cron.alter_job(jid,command=>'SELECT public.atualizar_prisma_cockpit()'); end if;
end $$;
