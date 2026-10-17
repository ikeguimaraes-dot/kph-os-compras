-- Pulso 86: relação diária de itens 86/85 por casa, de bate-pronto.
-- Views JÁ APLICADAS em produção via MCP em 16/10/2026 (este arquivo documenta).
--
-- Também redefine v_86_protecao_prato SEM o filtro `pvf.status = 'confirmado'`:
-- a classe de proteção (INEGOCIÁVEL/PROTEGIDO/...) não depende de a ficha estar
-- confirmada — um Pareto A sem ficha continua inegociável. Antes, itens como a
-- Vaca Velha (FNZ, Pareto A, ficha pendente) apareciam sem classe.

create or replace view v_86_protecao_prato as
with grupo_recente as (
  select distinct on (pvf_1.unit_id, pvf_1.id) pvf_1.unit_id,
    pvf_1.id as produto_id, p.grupo
  from produto_venda_ficha pvf_1
  join lorean_workdays w on w.unit_id = pvf_1.unit_id
  join lorean_produtos_dia p on p.workday_id_fk = w.id
    and upper(unaccent(trim(both from p.produto))) = pvf_1.nome_venda
  where p.grupo is not null
  order by pvf_1.unit_id, pvf_1.id, w.data desc
)
select pvf.unit_id,
  pvf.id as produto_id,
  pvf.nome_venda as nome_venda_key,
  pvf.nome_venda_original as nome,
  pvf.receita_12m,
  coalesce(par.classe_abc, 'C') as classe_abc,
  coalesce(p86.assinatura, false) as assinatura,
  gr.grupo,
  cat.teto_86_simultaneo,
  coalesce(cat.critica, false) as critica,
  case
    when coalesce(par.classe_abc,'C')='A' and (coalesce(p86.assinatura,false) or coalesce(cat.teto_86_simultaneo,1)=0) then 'INEGOCIAVEL'
    when coalesce(par.classe_abc,'C')='A' or coalesce(p86.assinatura,false) then 'PROTEGIDO'
    when coalesce(par.classe_abc,'C')='B' then 'GERENCIAVEL'
    else 'LIVRE'
  end as classe_86
from produto_venda_ficha pvf
left join mv_pareto_prato_v2 par on par.unit_id=pvf.unit_id and par.produto_id=pvf.id
left join compras_86_prato p86 on p86.unit_id=pvf.unit_id and upper(unaccent(trim(both from p86.prato)))=pvf.nome_venda
left join grupo_recente gr on gr.unit_id=pvf.unit_id and gr.produto_id=pvf.id
left join compras_86_categoria cat on cat.unit_id=pvf.unit_id and cat.grupo=gr.grupo;

-- Itens do ÚLTIMO relatório diário de cada casa. tipo '85' = observação começa
-- com "85" (alerta de estoque baixo registrado no mesmo relatório).
create or replace view v_pulso_86 as
with ult_data as (
  select unit_id, max(data) as data
  from op_relatorio_diario
  group by unit_id
),
rels as (
  select r.id, r.unit_id, r.data
  from op_relatorio_diario r
  join ult_data d on d.unit_id = r.unit_id and d.data = r.data
)
select distinct on (rels.unit_id, upper(trim(o.produto_nome)))
  o.id as op_86_id,
  rels.unit_id,
  u.name as casa,
  rels.data,
  o.produto_nome as item,
  o.setor,
  case when o.observacao ~ '^85' then '85' else '86' end as tipo,
  o.motivo::text as causa,
  o.observacao,
  coalesce(p.classe_86, p2.classe_86) as classe_86,
  coalesce(p.grupo, p2.grupo) as grupo,
  coalesce(p.receita_12m, p2.receita_12m) as receita_12m,
  (a.id is not null) as em_acompanhamento
from rels
join op_86 o on o.relatorio_id = rels.id
join units u on u.id = rels.unit_id
left join abastecimento_86 a on a.op_86_id = o.id
left join v_86_protecao_prato p
  on p.unit_id = rels.unit_id
 and p.produto_id = coalesce(a.produto_venda_ficha_id, a.sugestao_prato_id)
left join v_86_protecao_prato p2
  on p2.unit_id = rels.unit_id
 and p2.nome_venda_key = upper(unaccent(trim(o.produto_nome)))
order by rels.unit_id, upper(trim(o.produto_nome)), o.id;

-- Tetos de categoria vs. 86 simultâneos no pulso do dia.
create or replace view v_pulso_86_teto as
select pu.unit_id, pu.casa, pu.grupo,
       c.teto_86_simultaneo as teto,
       count(*)::int as n_86,
       (count(*) > c.teto_86_simultaneo) as estourado
from v_pulso_86 pu
join compras_86_categoria c on c.unit_id = pu.unit_id and c.grupo = pu.grupo
where pu.tipo = '86'
group by pu.unit_id, pu.casa, pu.grupo, c.teto_86_simultaneo;
