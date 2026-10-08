-- Read models only. Source ledgers are never changed.
create view public.v_prisma_completude_mes as
with cal as (
 select u.unit_id,d::date mes from public.everest_unidades u cross join
 generate_series(date_trunc('month',now() at time zone 'America/Sao_Paulo')-interval '35 months',date_trunc('month',now() at time zone 'America/Sao_Paulo'),interval '1 month') d where not u.fora_do_escopo_cmv
), nf as (
 select n.unit_id,date_trunc('month',n.dh_emissao at time zone 'America/Sao_Paulo')::date mes,count(distinct n.id) nfs,sum(i.vl_total) compras
 from public.everest_notas_recebidas n join public.everest_notas_recebidas_itens i on i.nota_id=n.id and i.entra_cmv_cfop group by 1,2
), venda as(select unit_id,mes,sum(receita) receita from public.mv_prisma_venda_mes group by 1,2), series as (
 select c.*,coalesce(n.nfs,0) nfs,coalesce(n.compras,0) compras,coalesce(v.receita,0) receita from cal c left join nf n using(unit_id,mes) left join venda v using(unit_id,mes)
), medias as (
 select *,avg(nfs) over w nfs_media_3m,avg(compras) over w compras_media_3m,avg(receita) over w receita_media_3m,
 count(*) filter(where nfs>0) over w meses_base_nf,count(*)filter(where receita>0) over w meses_base_receita
 from series window w as(partition by unit_id order by mes rows between 3 preceding and 1 preceding)
)
select *,nfs/nullif(nfs_media_3m,0) pct_completo,
 case when meses_base_nf=3 then nfs/nullif(nfs_media_3m,0)<0.85 else null end notas_incompletas,
 case when receita_media_3m>0 then receita<0.6*receita_media_3m else null end receita_parcial
from medias;
-- One count per item/depot/day, latest inventory number wins on overlapping counts.
-- Group counts are retained as partial evidence, never assumed to cover the depot.
create view public.v_prisma_estoque_item as
with contagem as (
 select distinct on(v.unit_id,v.dt_inventario,v.everest_cd_deposito,coalesce(i.item_id::text,'codigo:'||i.everest_id_item::text))
 v.unit_id,v.dt_inventario dia,v.everest_cd_deposito deposito_id,v.deposito,v.grupo grupo_inventario,v.id inventario_id,
 i.item_id,i.descricao_item,i.unidade_medida,i.quantidade_convertida quantidade
 from public.everest_inventarios v join public.everest_inventario_itens i on i.inventario_id=v.id
 where v.situacao='ENCERRADO' and v.tipo in('ROTATIVO','GERAL')
 order by v.unit_id,v.dt_inventario,v.everest_cd_deposito,coalesce(i.item_id::text,'codigo:'||i.everest_id_item::text),v.nr_inventario desc,v.atualizado_em desc,i.id
)
select c.*,coalesce(h.vl_custo_medio,p.preco_medio) custo_unitario,
 case when h.vl_custo_medio>0 then 'custo médio Everest do mês' when p.preco_medio>0 then 'compra na casa no mês' else 'sem custo' end fonte_custo,
 c.quantidade*coalesce(h.vl_custo_medio,p.preco_medio) valor_rs,
 c.quantidade*coalesce(h.vl_custo_medio,p.preco_medio,r.vl_custo_medio) valor_referencia_rs
from contagem c
left join lateral(select vl_custo_medio from public.everest_itens_custo_historico h where h.unit_id=c.unit_id and h.item_id=c.item_id and h.ano=extract(year from c.dia) and h.mes=extract(month from c.dia) and h.vl_custo_medio>0 order by atualizado_em desc limit 1) h on true
left join public.v_prisma_preco_mes p on p.unit_id=c.unit_id and p.item_id=c.item_id and p.mes=date_trunc('month',c.dia)::date and p.preco_medio>0
left join lateral(select vl_custo_medio from public.everest_itens_custo_historico h where h.unit_id=c.unit_id and h.item_id=c.item_id and make_date(h.ano,h.mes,1)<=c.dia and h.vl_custo_medio>0 order by ano desc,mes desc,atualizado_em desc limit 1) r on true;
create or replace view public.v_prisma_estoque_fechamento as
select unit_id,dia,array_agg(distinct deposito_id order by deposito_id) depositos,
 sum(valor_rs) estoque_rs,
 bool_and(quantidade is not null and quantidade>=0 and (quantidade=0 or valor_referencia_rs is not null))
 and coalesce(sum(valor_rs)/nullif(sum(valor_referencia_rs),0),0)>=0.9
 and bool_or(nullif(trim(grupo_inventario),'') is null) custo_completo,
 count(*)filter(where quantidade>0) itens_positivos,
 count(*)filter(where quantidade>0 and custo_unitario is null) itens_sem_custo,
 case when bool_and(quantidade=0 or valor_referencia_rs is not null) then sum(valor_rs)/nullif(sum(valor_referencia_rs),0) end pct_valorado,
 count(*)filter(where quantidade>0 and valor_referencia_rs is null) itens_sem_referencia
from public.v_prisma_estoque_item group by 1,2;
comment on view public.v_prisma_estoque_fechamento is 'AJUSTE/CANCELADO excluídos. Contagens por grupo são evidência parcial. Cobertura financeira usa referência histórica somente no denominador; item positivo sem qualquer referência torna cobertura desconhecida e impede método inventário. Exige mesmos depósitos e datas exatas na margem mensal.';
alter table public.compras_fornecedor_apelido add column origem text not null default 'auto' check(origem in('auto','manual'));
update public.compras_fornecedor_apelido set origem='manual' where atualizado_por is not null;
create function public.prisma_apelido_auto(nome text) returns text language sql immutable set search_path=public,pg_temp as $$
select trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(initcap(lower(nome)), '^([0-9 ./-]+)', ''), '\m(Ltda|S/A|Me|Comercio|Comércio|Distribuidora|Distribuicao|Distribuição|Importacao|Importação|Importadora|Exportacao|Exportação|Industria|Indústria|Alimentos|Alimento|Produtos|Generos|Gêneros|Alimenticios|Alimentícios)\M', '', 'gi'), '\mDe\M', 'de', 'g'), '\s+', ' ', 'g'),' .-/&');
$$;
-- Curated trading names where the source name identifies the supplier without ambiguity.
update public.compras_fornecedor_apelido a set apelido=case
 when n.nome ~* '^WEW' then 'WEW' when n.nome ~* 'MISTRAL' then 'Mistral'
 when n.nome ~* '^MAV' then 'MAV Hortifrúti' when n.nome ~* 'BENFICA' then 'Benfica'
 when n.nome ~* '^STORM' then 'Storm' when n.nome ~* 'IRMAOS AVELI' then 'Irmãos Avelino'
 when n.nome ~* '^VPJ' then 'VPJ' when n.nome ~* '^DTK' then 'DTK'
 when n.nome ~* '^GUIDARA' then 'Guidara' when n.nome ~* '^FG7' then 'FG7'
 when n.nome ~* 'IGARASSU' then 'Igarassu' when n.nome ~* '^EAU' then 'EAU Água Mineral'
 when n.nome ~* '^JOG' then 'JOG Carnes' when n.nome ~* '^SPAL' then 'Spal (Coca-Cola)'
 when n.nome ~* '^HNK' then 'Heineken (HNK)' when n.nome ~* '^CHOPP FAST' then 'Chopp Fast'
 when n.nome ~* '^CRISTIANE HASEGAWA' then 'Cristiane Hasegawa'
 when n.nome ~* '^FSW' then 'FSW Carnes' when n.nome ~* '^JP RAMOS' then 'JP Ramos'
 when n.nome ~* '^KENSTAR' then 'Kenstar'
 else coalesce(nullif(public.prisma_apelido_auto(n.nome),''),'Fornecedor a revisar') end,
 atualizado_em=now()
from(select raiz_cnpj,max(fornecedor_nome) nome from public.v_prisma_linhas group by 1)n
where a.raiz_cnpj=n.raiz_cnpj and a.origem='auto';
update public.compras_fornecedor_apelido set apelido=replace(replace(replace(replace(replace(apelido,' Da ',' da '),' Do ',' do '),' Das ',' das '),' Dos ',' dos '),' E ',' e ') where origem='auto';
revoke all on public.v_prisma_completude_mes,public.v_prisma_estoque_item from public,anon,authenticated;
grant select on public.v_prisma_completude_mes,public.v_prisma_estoque_item to service_role;
revoke all on function public.prisma_apelido_auto(text) from public,anon,authenticated;
grant execute on function public.prisma_apelido_auto(text) to service_role;
notify pgrst,'reload schema';
