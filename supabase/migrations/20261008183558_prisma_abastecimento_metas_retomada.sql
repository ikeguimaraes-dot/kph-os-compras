create or replace view public.v_abastecimento_kpi as
with semanas as(select u.unit_id,d::date semana from public.everest_unidades u cross join generate_series(date_trunc('week',now() at time zone 'America/Sao_Paulo')-interval '11 weeks',date_trunc('week',now() at time zone 'America/Sao_Paulo'),interval '1 week')d where not u.fora_do_escopo_cmv),fila as(
 select a.*,r.data from public.abastecimento_86 a join public.op_86 o on o.id=a.op_86_id join public.op_relatorio_diario r on r.id=o.relatorio_id
),f as(select a.unit_id,date_trunc('week',a.data)::date semana,count(*) registros,
 count(distinct a.produto_venda_ficha_id)filter(where a.tipo='ruptura' and a.causa_confirmada_em is not null) produtos_ruptura,
 count(*)filter(where a.causa_confirmada_em is not null and nullif(trim(a.responsavel),'') is not null)::numeric/nullif(count(*),0) causa_dono_pct,
 avg(extract(epoch from greatest(a.retomada_cozinha_em,a.retomada_pdv_em)-a.inicio_confirmado_em)/3600)filter(where a.inicio_confirmado_em is not null and a.retomada_cozinha_em is not null and a.retomada_pdv_em is not null and a.retomada_cozinha_em>=a.inicio_confirmado_em) retomada_horas,
 avg(extract(epoch from greatest(a.retomada_cozinha_em,a.retomada_pdv_em)-a.inicio_confirmado_em)/3600)filter(where p.papel='assinatura' and a.inicio_confirmado_em is not null and a.retomada_cozinha_em is not null and a.retomada_pdv_em is not null and a.retomada_cozinha_em>=a.inicio_confirmado_em) retomada_assinatura_horas
 from fila a left join public.cardapio_papel p on p.produto_venda_ficha_id=a.produto_venda_ficha_id group by 1,2),compra as(select unit_id,date_trunc('week',data)::date semana,sum(vl_total) gasto,sum(vl_total)filter(where nullif(trim(nr_pedido),'') is not null and trim(nr_pedido)<>'0') pedido from public.v_prisma_linhas group by 1,2)
select s.*,coalesce(f.registros,0) registros,coalesce(f.produtos_ruptura,0) produtos_ruptura,f.causa_dono_pct,f.retomada_horas,f.retomada_assinatura_horas,c.pedido/nullif(c.gasto,0) com_pedido_pct,
 p.prazo_dias,
 (select sum(t.vl_saldo) from public.v_abastecimento_titulos t where t.unit_id=s.unit_id and t.dias_atraso>0 and exists(select 1 from public.cardapio_papel cp join public.produto_venda_ficha b on b.id=cp.produto_venda_ficha_id and b.status='confirmado' join public.mv_prisma_ficha_insumo fi on fi.unit_id=b.unit_id and fi.ficha_id=b.ficha_id join public.v_share_fornecedor_item sh on sh.unit_id=fi.unit_id and sh.item_id=fi.insumo_id where cp.papel='assinatura' and cp.unit_id=s.unit_id and sh.raiz_cnpj=t.fornecedor_raiz)) vencido_assinatura_atual,
 (select m.receita_coberta/nullif(m.receita,0) from public.v_prisma_margem_mes m where m.unit_id=s.unit_id and m.mes=date_trunc('month',s.semana)::date) cobertura_custo_pct,
 (now() at time zone 'America/Sao_Paulo')::date atualizado_em
from semanas s left join f using(unit_id,semana) left join compra c using(unit_id,semana)
left join lateral(select sum((t.dt_vencimento-t.dt_documento)*t.vl_titulo)/nullif(sum(t.vl_titulo),0) prazo_dias from public.everest_titulos_fornecedor t where t.unit_id=s.unit_id and t.at_situacao in(1,9) and t.dt_documento>=s.semana and t.dt_documento<s.semana+7 and t.vl_titulo>0 and t.dt_vencimento>=t.dt_documento)p on true;
create table public.abastecimento_metas (indicador text primary key,meta numeric,unidade text,descricao text not null);
alter table public.abastecimento_metas enable row level security;
revoke all on public.abastecimento_metas from public,anon,authenticated;
grant select on public.abastecimento_metas to service_role;
create policy servico on public.abastecimento_metas for select to service_role using(true);
insert into public.abastecimento_metas values
('causa_dono_pct',1,'proporcao','Causa confirmada e dono em todos os registros'),
('retomada_assinatura_horas',48,'horas','Retomada de assinatura confirmada na cozinha e no PDV'),
('com_pedido_pct',0.8,'proporcao','Gasto com pedido de compra'),
('cobertura_custo_pct',0.9,'proporcao','Receita com ficha e custo completos'),
('vencido_assinatura',0,'BRL','Saldo conciliado dos fornecedores de assinatura'),
('ruptura_assinatura',0,'produtos','Nenhuma ruptura evitável em assinatura');
notify pgrst,'reload schema';
