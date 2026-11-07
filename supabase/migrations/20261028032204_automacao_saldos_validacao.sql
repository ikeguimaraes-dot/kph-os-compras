create or replace function public.compras_automacao_base(p_unit_ids uuid[],p_dia date default (now() at time zone 'America/Sao_Paulo')::date)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
with houses as materialized(select id,name from units where id=any(p_unit_ids) and active and lorean_code is not null),
raw_docs as materialized(
 select w.unit_id,w.empresa,w.concluido_em,d
 from everest_estoque_movimentos w join houses h on h.id=w.unit_id cross join lateral jsonb_array_elements(w.registros)d
 where (d->>'dt_movimento')::date>=p_dia-84 and (d->>'dt_movimento')::date<p_dia
 and (d->>'cd_empresa')::integer=w.empresa and d->>'id_movimentoestoque' is not null
),
docs as materialized(
 select distinct on(unit_id,empresa,d->>'id_movimentoestoque') * from raw_docs
 order by unit_id,empresa,d->>'id_movimentoestoque',concluido_em desc
),
pdv as materialized(select * from docs where d->>'at_situacao'='1' and d->>'ds_movimentoestoquetipo_origem'='VENDA DO DIA (INTEGRACAO PDV)'),
sales as materialized(
 select w.unit_id,w.data,
 bool_or(coalesce(w.qualidade_suspeito,false)) as suspeito,
 bool_or(w.turno='dia_inteiro') and count(distinct w.turno)>1 as sobreposto,
 bool_or(p.n=0) as incompleto,bool_or(p.evento) as evento
 from lorean_workdays w join houses h on h.id=w.unit_id
 cross join lateral(select count(*) n,coalesce(bool_or(produto ~* '^(EVA|EVT) ' or grupo ~* '(evento|sunset)'),false) evento from lorean_produtos_dia where workday_id_fk=w.id)p
 where w.data>=p_dia-84 and w.data<p_dia and w.receita_bruta>0 group by w.unit_id,w.data
),
valid_days as materialized(
 select s.unit_id,s.data from sales s where not(s.suspeito or s.sobreposto or s.incompleto or s.evento)
 and exists(select 1 from pdv p where p.unit_id=s.unit_id and (p.d->>'dt_movimento')::date=s.data)
),
lines as materialized(
 select p.unit_id,(p.d->>'dt_movimento')::date dia,e.id item_id,e.descricao,e.unidade_medida,e.subgrupo,
 (i->>'qt_convertido')::numeric qtd,
 upper(trim(i->>'sg_unidademedida'))=upper(trim(e.unidade_medida)) and i->>'at_movimentacao'='143' and (i->>'qt_convertido')::numeric>=0 as valido
 from pdv p cross join lateral jsonb_array_elements(p.d->'itens')i
 join everest_itens e on e.cd_item=i->>'cd_item' and e.everest_codigo=(i->>'id_item')::integer
 where e.subgrupo ~ '^MP[AB]\.' or e.subgrupo='PRODUCAO'
),
items as materialized(select unit_id,item_id,max(descricao) nome,max(unidade_medida) medida,max(subgrupo) subgrupo,min(dia) primeiro_dia,count(*) filter(where not coalesce(valido,false)) pendencias from lines group by unit_id,item_id),
daily as materialized(select l.unit_id,l.item_id,l.dia,sum(l.qtd) qtd from lines l join valid_days v on v.unit_id=l.unit_id and v.data=l.dia where l.valido group by l.unit_id,l.item_id,l.dia),
means as materialized(
 select i.unit_id,i.item_id,extract(isodow from v.data)::int dow,count(*) amostras,avg(coalesce(d.qtd,0)) media
 from items i join valid_days v on v.unit_id=i.unit_id and v.data>=i.primeiro_dia
 left join daily d on d.unit_id=i.unit_id and d.item_id=i.item_id and d.dia=v.data
 group by i.unit_id,i.item_id,extract(isodow from v.data)
),
stocks as materialized(
 select a.unit_id,e.id item_id,sum((j->>'qt_estoque')::numeric) quantidade,min(s.concluido_em) observado_em,
 bool_and(upper(trim(j->>'sg_unidademedida'))=upper(trim(e.unidade_medida)) and (j->>'qt_estoque')::numeric>=0) unidade_ok,
 count(*)=count(distinct (a.empresa,a.deposito)) sem_duplicidade
 from compras_automacao_deposito a join houses h on h.id=a.unit_id
 join everest_estoque_saldos s on s.unit_id=a.unit_id and s.empresa=a.empresa and s.deposito=a.deposito
 cross join lateral jsonb_array_elements(s.registros)j join everest_itens e on e.cd_item=j->>'cd_item' and e.everest_codigo=(j->>'id_item')::integer
 where (j->>'cd_empresa')::integer=a.empresa and (j->>'cd_deposito')::integer=a.deposito
 group by a.unit_id,e.id
),
open_orders as materialized(
 select o.unit_id,o.id order_id,o.data_prevista,oi.id pedido_item_id,m.item_id,
 (oi.quantidade-coalesce(oi.quantidade_recebida,0))*m.fator_unidade pendente
 from purchase_orders o join houses h on h.id=o.unit_id join purchase_order_items oi on oi.order_id=o.id
 left join compras_automacao_pedido_item m on m.pedido_item_id=oi.id
 where o.status::text not in ('recebido','cancelado','rascunho') and oi.quantidade>coalesce(oi.quantidade_recebida,0)
),
rows as (
 select i.*,s.quantidade estoque,s.observado_em,
 coalesce(s.unidade_ok and s.sem_duplicidade and (select count(*) from compras_automacao_deposito a where a.unit_id=i.unit_id)=(select count(*) from compras_automacao_deposito a join everest_estoque_saldos es on es.unit_id=a.unit_id and es.empresa=a.empresa and es.deposito=a.deposito where a.unit_id=i.unit_id and exists(select 1 from jsonb_array_elements(es.registros) j where j->>'cd_item'=(select cd_item from everest_itens where id=i.item_id))),false) estoque_validado,
 a.embalagem,coalesce(a.minimo_embalagens,0) minimo_embalagens,a.seguranca,a.lead_dias,a.porcao_minima,
 coalesce((select jsonb_agg(jsonb_build_object('dow',dow,'samples',amostras,'quantity',case when i.pendencias=0 then media end) order by dow) from means m where m.unit_id=i.unit_id and m.item_id=i.item_id),'[]'::jsonb) medias,
 coalesce((select jsonb_agg(jsonb_build_object('date',data_prevista,'quantity',pendente,'confirmed',true)) from open_orders o where o.unit_id=i.unit_id and o.item_id=i.item_id),'[]'::jsonb) entregas,
 not exists(select 1 from open_orders o where o.unit_id=i.unit_id and (o.item_id is null or o.data_prevista is null)) pedidos_conciliados,
 (select max(concluido_em) from docs d where d.unit_id=i.unit_id) fonte_atualizada_em,
 (select max((d->>'dt_movimento')::date) from pdv p where p.unit_id=i.unit_id) ultimo_pdv,
 exists(select 1 from sales sa where sa.unit_id=i.unit_id and sa.data>=p_dia-7 and not exists(select 1 from pdv p where p.unit_id=sa.unit_id and (p.d->>'dt_movimento')::date=sa.data)) lacuna_pdv_recente,
 pm.preco_medio,
 (select count(*) from posicao_86_em(now()) p join posicao_86_item pi on pi.id=p.item_id where p.unit_id=i.unit_id and pi.insumo_id=i.item_id and p.motivo='fora_do_padrao')>0 bloqueio_qualidade
 from items i left join stocks s on s.unit_id=i.unit_id and s.item_id=i.item_id
 left join compras_automacao_parametro a on a.unit_id=i.unit_id and a.item_id=i.item_id
 left join v_preco_medio_compra pm on pm.unit_id=i.unit_id and pm.item_id=i.item_id
)
select jsonb_build_object('as_of',p_dia,'units',(select jsonb_agg(h) from houses h),
 'items',coalesce((select jsonb_agg(r order by nome,unit_id) from rows r),'[]'::jsonb),
 'coverage',(select jsonb_agg(x) from(select h.id,count(s.data) dias_vendas,count(s.data) filter(where s.evento) dias_eventos,count(v.data) dias_conciliados from houses h left join sales s on s.unit_id=h.id left join valid_days v on v.unit_id=h.id and v.data=s.data group by h.id)x));
$$;
revoke all on function public.compras_automacao_base(uuid[],date) from public,anon,authenticated;
grant execute on function public.compras_automacao_base(uuid[],date) to service_role;

-- Registra a leitura automática sem emitir pedidos ou substituir a fonte ERP.
create or replace function public.compras_automacao_atualizar() returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare u uuid; n integer:=0; v jsonb; inserted integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('compras_automacao_atualizar',0));
 for u in select distinct i.unit_id from posicao_86_item i join units un on un.id=i.unit_id where un.active loop
  v:=compras_automacao_base(array[u]);
  insert into compras_automacao_execucao(unit_id,referencia,versao,resultado,chave)
  values(u,(now() at time zone 'America/Sao_Paulo')::date,'base-everest-v2',v,'v2:'||to_char(now() at time zone 'UTC','YYYY-MM-DD-HH24'))
  on conflict(unit_id,chave) do nothing;
  get diagnostics inserted = row_count; n:=n+inserted;
 end loop;
 return n;
end $$;
revoke all on function public.compras_automacao_atualizar() from public,anon,authenticated;
grant execute on function public.compras_automacao_atualizar() to service_role;
