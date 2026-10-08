-- Normalize names once and join precomputed daily flags instead of repeating
-- correlated name matching for every dish on every operating day.
create or replace view public.v_abastecimento_prato_dia as
with pratos as materialized (
 select id,unit_id,nome_venda,public.abastecimento_nome(nome_venda) nome
 from public.produto_venda_ficha
), dias as (
 select distinct unit_id,data from public.lorean_workdays
 where data >= (now() at time zone 'America/Sao_Paulo')::date-400
), ocorrencias as materialized (
 select r.unit_id,r.data,a.produto_venda_ficha_id,
 public.abastecimento_nome(o.produto_nome) nome
 from public.op_86 o join public.op_relatorio_diario r on r.id=o.relatorio_id
 left join public.abastecimento_86 a on a.op_86_id=o.id
 where r.data >= (now() at time zone 'America/Sao_Paulo')::date-400
), bloqueios as materialized (
 select distinct b.id,o.data from pratos b join ocorrencias o on o.unit_id=b.unit_id
 and (o.produto_venda_ficha_id=b.id or o.nome=b.nome)
 union
 select distinct a.produto_venda_ficha_id,d.data
 from public.abastecimento_86 a join public.op_86 o on o.id=a.op_86_id
 join public.op_relatorio_diario r on r.id=o.relatorio_id
 join dias d on d.unit_id=a.unit_id and d.data>=r.data
 and (a.retomada_cozinha_em is null or d.data<=(a.retomada_cozinha_em at time zone 'America/Sao_Paulo')::date)
 where a.causa_confirmada_em is not null and a.produto_venda_ficha_id is not null
), ambiguidades as materialized (
 select distinct b.id,o.data from pratos b join ocorrencias o on o.unit_id=b.unit_id
 and o.produto_venda_ficha_id is null and o.nome<>b.nome
 and similarity(o.nome,b.nome)>=0.3
), relatorios as (
 select distinct unit_id,data from public.op_relatorio_diario where status::text='enviado'
), vendas_brutas as materialized (
 select w.unit_id,w.data,p.produto,sum(p.qtd) qtd,sum(p.total) receita
 from public.lorean_produtos_dia p join public.lorean_workdays w on w.id=p.workday_id_fk
 where w.data >= (now() at time zone 'America/Sao_Paulo')::date-400
 group by w.unit_id,w.data,p.produto
), nomes as materialized (
 select produto,public.abastecimento_nome(produto) nome
 from (select distinct produto from vendas_brutas) n
), vendas as (
 select v.unit_id,v.data,n.nome,sum(v.qtd) qtd,sum(v.receita) receita
 from vendas_brutas v join nomes n on n.produto=v.produto
 group by v.unit_id,v.data,n.nome
)
select b.id,b.unit_id,b.nome_venda,d.data,
 r.unit_id is not null as relatorio_enviado,
 k.id is not null as bloqueado,
 a.id is not null as ambiguidade,
 coalesce(v.qtd,0) qtd,coalesce(v.receita,0) receita,
 r.unit_id is not null and a.id is null as disponibilidade_conhecida
from pratos b join dias d on d.unit_id=b.unit_id
left join relatorios r on r.unit_id=b.unit_id and r.data=d.data
left join bloqueios k on k.id=b.id and k.data=d.data
left join ambiguidades a on a.id=b.id and a.data=d.data
left join vendas v on v.unit_id=b.unit_id and v.data=d.data and v.nome=b.nome;
