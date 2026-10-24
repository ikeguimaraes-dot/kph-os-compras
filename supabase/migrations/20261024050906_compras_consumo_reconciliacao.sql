create or replace function public.compras_consumo_everest(p_unit_ids uuid[])
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
with params as (select (now() at time zone 'America/Sao_Paulo')::date as hoje),
houses as (select id,name from units where id=any(p_unit_ids) and active and lorean_code is not null),
windows as (select m.* from everest_estoque_movimentos m join houses h on h.id=m.unit_id cross join params p where m.periodo_fim>=p.hoje-84),
days as (select distinct w.unit_id,g::date as dia from windows w cross join lateral generate_series(w.periodo_inicio,w.periodo_fim,interval '1 day') g cross join params p where g::date<p.hoje and g::date>=p.hoje-84 and w.concluido_em>now()-interval '48 hours'),
coverage as (select h.id,h.name,count(d.dia) filter(where d.dia>=p.hoje-28) as d4,count(d.dia) filter(where d.dia>=p.hoje-56) as d8,count(d.dia) as d12 from houses h cross join params p left join days d on d.unit_id=h.id group by h.id,h.name),
docs as (select w.unit_id,m from windows w cross join lateral jsonb_array_elements(w.registros) m cross join params p where (m->>'dt_movimento')::date>=p.hoje-84 and (m->>'dt_movimento')::date<p.hoje),
pdv_days as materialized (select distinct d.unit_id,(d.m->>'dt_movimento')::date as dia from docs d where d.m->>'at_situacao'='1' and d.m->>'ds_movimentoestoquetipo_origem'='VENDA DO DIA (INTEGRACAO PDV)'),
gaps as materialized (select distinct w.unit_id,w.data as dia from lorean_workdays w join houses h on h.id=w.unit_id join days d on d.unit_id=w.unit_id and d.dia=w.data where w.receita_bruta>0 and not exists(select 1 from pdv_days p where p.unit_id=w.unit_id and p.dia=w.data)),
lines as materialized (select d.unit_id,(d.m->>'dt_movimento')::date as dia,(i->>'id_item')::integer as item,i->>'ds_item' as nome,i->>'sg_unidademedida' as unidade,(i->>'qt_convertido')::numeric as qtd,(i->>'at_movimentacao')::integer as tipo,
 coalesce(upper(trim(e.unidade_medida))=upper(trim(i->>'sg_unidademedida')),false) as unidade_confirmada,e.subgrupo
 from docs d cross join lateral jsonb_array_elements(d.m->'itens') i left join everest_itens e on e.everest_codigo=(i->>'id_item')::integer
 where d.m->>'at_situacao'='1' and d.m->>'ds_movimentoestoquetipo_origem'='VENDA DO DIA (INTEGRACAO PDV)'),
totals as (select l.unit_id,l.item,max(l.nome) as nome,l.unidade,max(l.subgrupo) as subgrupo,
 sum(l.qtd) filter(where l.dia>=p.hoje-28 and l.tipo=143 and l.qtd>=0 and l.unidade_confirmada) as q4,
 sum(l.qtd) filter(where l.dia>=p.hoje-56 and l.tipo=143 and l.qtd>=0 and l.unidade_confirmada) as q8,
 sum(l.qtd) filter(where l.tipo=143 and l.qtd>=0 and l.unidade_confirmada) as q12,
 count(*) filter(where not l.unidade_confirmada or l.tipo<>143 or l.qtd<0) as pendencias
 from lines l cross join params p group by l.unit_id,l.item,l.unidade),
items as (select t.*,case when c.d4=28 and t.pendencias=0 and not exists(select 1 from gaps g cross join params p where g.unit_id=t.unit_id and g.dia>=p.hoje-28) then coalesce(q4,0)/4 end as w4,
 case when c.d8=56 and t.pendencias=0 and not exists(select 1 from gaps g cross join params p where g.unit_id=t.unit_id and g.dia>=p.hoje-56) then coalesce(q8,0)/8 end as w8,
 case when c.d12=84 and t.pendencias=0 and not exists(select 1 from gaps g cross join params p where g.unit_id=t.unit_id and g.dia>=p.hoje-84) then coalesce(q12,0)/12 end as w12
 from totals t join coverage c on c.id=t.unit_id),
status as (select h.id,h.name,c.d4,c.d8,c.d12,
 (select max(w.concluido_em) from windows w where w.unit_id=h.id) as atualizado_em,
 (select count(*) from docs d where d.unit_id=h.id) as documentos,
 (select max((d.m->>'dt_movimento')::date) from docs d where d.unit_id=h.id and d.m->>'at_situacao'='1' and d.m->>'ds_movimentoestoquetipo_origem'='VENDA DO DIA (INTEGRACAO PDV)') as ultimo_pdv,
 (select coalesce(jsonb_agg(g.dia order by g.dia),'[]'::jsonb) from gaps g where g.unit_id=h.id) as dias_venda_sem_baixa
 from houses h join coverage c on c.id=h.id)
select jsonb_build_object('as_of',(select hoje from params),
 'units',coalesce((select jsonb_agg(to_jsonb(s) order by name) from status s),'[]'::jsonb),
 'items',coalesce((select jsonb_agg(to_jsonb(i) order by nome,item) from items i),'[]'::jsonb));
$$;
revoke all on function public.compras_consumo_everest(uuid[]) from public,anon,authenticated;
grant execute on function public.compras_consumo_everest(uuid[]) to service_role;
comment on function public.compras_consumo_everest(uuid[]) is 'Consumo PDV registrado, sem correção de ruptura ou previsão futura. Médias liberadas somente com janelas importadas completas e unidade compatível com catálogo. Não calcula compra líquida.';
