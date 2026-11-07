-- A fila antiga continua íntegra; deixa de determinar indisponibilidade.
create view public.v_pendencias_acompanhamento_86 with(security_invoker=true) as
select a.id,a.unit_id,a.produto_venda_ficha_id as prato_id,
 coalesce(a.inicio_confirmado_em::date,r.data) inicio,a.causa::text causa,
 a.causa_confirmada_em is not null confirmado,a.status,o.produto_nome nome,
 case when o.observacao ~ '^85' then '85' else '86' end tipo,
 'pendencia_acompanhamento'::text classificacao
from abastecimento_86 a join op_86 o on o.id=a.op_86_id join op_relatorio_diario r on r.id=o.relatorio_id
where a.status not in ('retomado','planejado');
revoke all on public.v_pendencias_acompanhamento_86 from anon,authenticated;
grant select on public.v_pendencias_acompanhamento_86 to service_role;
create or replace view public.v_mapa_86 with(security_invoker=true) as
select a.id,p.unit_id,a.produto_id prato_id,(p.confirmado_em at time zone 'America/Sao_Paulo')::date inicio,
 p.motivo causa,true confirmado,'aberto'::text status,i.nome
from posicao_86_em(now()) p join posicao_86_item i on i.id=p.item_id
join posicao_86_afetado a on a.item_id=p.item_id and a.unit_id=p.unit_id
join posicao_86_atual s on s.unit_id=p.unit_id
where p.tipo=86 and a.destino='salao' and a.produto_id is not null and s.status='atualizado';
create or replace view public.v_pulso_86 with(security_invoker=true) as
select i.id op_86_id,p.unit_id,u.name casa,(p.confirmado_em at time zone 'America/Sao_Paulo')::date data,
 i.nome item,null::text setor,p.tipo::text tipo,p.motivo causa,
 case when s.status='desatualizado' then 'Posição desatualizada; não comprova disponibilidade atual' else i.pendencia end observacao,
 null::text classe_86,null::text grupo,null::numeric receita_12m,false em_acompanhamento
from posicao_86_em(now()) p join posicao_86_item i on i.id=p.item_id join units u on u.id=p.unit_id
join posicao_86_atual s on s.unit_id=p.unit_id;
