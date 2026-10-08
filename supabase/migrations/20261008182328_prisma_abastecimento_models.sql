create function public.sincronizar_abastecimento() returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not pg_try_advisory_xact_lock(hashtext('sincronizar_abastecimento')) then return; end if;
 insert into public.abastecimento_86(op_86_id,unit_id,criado_por,sugestao_prato_id,sugestao_insumo_id,sugestao_fornecedor_raiz,sugestao_causa,sugestao_detalhe)
 select o.id,r.unit_id,o.created_by,b.id,c.item_id,c.raiz_cnpj,
 (case when o.motivo::text='padrao_qualidade' then 'qualidade_reprovada' when o.motivo::text='sazonalidade' then 'sazonalidade' when o.motivo::text='producao_planejamento' then 'producao_planejamento' when coalesce(v.vencido,0)>0 then 'fornecedor_bloqueado_pagamento' when o.motivo::text='fornecedor_ruptura' then 'atraso_entrega' else 'pedido_nao_feito' end)::public.abastecimento_causa,
 'Sugestão, requer confirmação. Motivo original: '||o.motivo::text||'. '||case when b.id is null then 'Prato sem correspondência.' when public.abastecimento_nome(b.nome_venda)<>public.abastecimento_nome(o.produto_nome) then 'Nome aproximado: conferir porção e identidade.' else 'Nome coincidente.' end
 from public.op_86 o join public.op_relatorio_diario r on r.id=o.relatorio_id
 left join lateral(select b.* from public.produto_venda_ficha b where b.unit_id=r.unit_id and (public.abastecimento_nome(b.nome_venda)=public.abastecimento_nome(o.produto_nome) or similarity(public.abastecimento_nome(b.nome_venda),public.abastecimento_nome(o.produto_nome))>=0.3) order by (public.abastecimento_nome(b.nome_venda)=public.abastecimento_nome(o.produto_nome)) desc,similarity(public.abastecimento_nome(b.nome_venda),public.abastecimento_nome(o.produto_nome)) desc,b.receita_12m desc limit 1)b on true
 left join lateral(select l.item_id,l.raiz_cnpj,sum(l.comprado_rs) gasto from public.mv_prisma_compra_mes l where l.unit_id=r.unit_id and l.mes>=date_trunc('month',r.data-365)::date and l.mes<=date_trunc('month',r.data)::date and l.comprado_rs>0 and
 (exists(select 1 from public.mv_prisma_ficha_insumo fi where fi.unit_id=r.unit_id and fi.ficha_id=b.ficha_id and fi.insumo_id=l.item_id) or public.abastecimento_nome(l.item_nome) like split_part(public.abastecimento_nome(o.produto_nome),' ',1)||'%')
 group by 1,2 order by gasto desc limit 1)c on true
 left join lateral(select sum(vl_saldo) vencido from public.v_abastecimento_titulos v where v.unit_id=r.unit_id and v.fornecedor_raiz=c.raiz_cnpj and v.dias_atraso>0)v on true
 where r.data>='2026-09-24' on conflict(op_86_id) do nothing;
 -- Evidence is a business day, not a precise selling timestamp. It never clears the kitchen block.
 update public.abastecimento_86 a set retomada_pdv_em=x.dia::timestamp at time zone 'America/Sao_Paulo',atualizado_em=now()
 from (select a.id,min(w.data) dia from public.abastecimento_86 a join public.op_86 o on o.id=a.op_86_id join public.op_relatorio_diario r on r.id=o.relatorio_id
 join public.produto_venda_ficha b on b.id=a.produto_venda_ficha_id
 join public.lorean_workdays w on w.unit_id=a.unit_id and w.data>r.data
 join public.lorean_produtos_dia p on p.workday_id_fk=w.id and public.abastecimento_nome(p.produto)=public.abastecimento_nome(b.nome_venda) and p.qtd>0
 where a.retomada_pdv_em is null group by a.id)x where a.id=x.id;
end $$;
revoke all on function public.sincronizar_abastecimento() from public,anon,authenticated;
grant execute on function public.sincronizar_abastecimento() to service_role;

select cron.schedule('compras-abastecimento','*/5 * * * *','select public.sincronizar_abastecimento()');
create view public.v_abastecimento_fila as
select a.*,o.produto_nome,o.motivo::text motivo_original,o.observacao,o.periodo::text periodo,r.data dia,r.status::text relatorio_status,
 b.nome_venda_original prato_sugerido,i.descricao insumo_sugerido,coalesce(ap.apelido,a.fornecedor_raiz,a.sugestao_fornecedor_raiz) fornecedor_nome,
 n.ultima_nota,coalesce(v.vencido,0) vencido_rs,p.papel
from public.abastecimento_86 a join public.op_86 o on o.id=a.op_86_id join public.op_relatorio_diario r on r.id=o.relatorio_id
left join public.produto_venda_ficha b on b.id=coalesce(a.produto_venda_ficha_id,a.sugestao_prato_id)
left join public.everest_itens i on i.id=coalesce(a.insumo_id,a.sugestao_insumo_id)
left join public.compras_fornecedor_apelido ap on ap.raiz_cnpj=coalesce(a.fornecedor_raiz,a.sugestao_fornecedor_raiz)
left join public.cardapio_papel p on p.produto_venda_ficha_id=a.produto_venda_ficha_id
left join lateral(select max(data) ultima_nota from public.v_prisma_linhas l where l.unit_id=a.unit_id and l.raiz_cnpj=coalesce(a.fornecedor_raiz,a.sugestao_fornecedor_raiz))n on true
left join lateral(select sum(vl_saldo) vencido from public.v_abastecimento_titulos t where t.unit_id=a.unit_id and t.fornecedor_raiz=coalesce(a.fornecedor_raiz,a.sugestao_fornecedor_raiz) and t.dias_atraso>0)v on true;
-- A recorded 86 blocks the whole business day (conservative for partial shifts).
create view public.v_abastecimento_prato_dia as
with dias as(select distinct unit_id,data from public.lorean_workdays),pratos as(select b.id,b.unit_id,b.nome_venda from public.produto_venda_ficha b),base as(
 select b.*,d.data,
 exists(select 1 from public.op_relatorio_diario r where r.unit_id=b.unit_id and r.data=d.data and r.status::text='enviado') relatorio_enviado,
 exists(select 1 from public.op_86 o join public.op_relatorio_diario r on r.id=o.relatorio_id left join public.abastecimento_86 a on a.op_86_id=o.id where r.unit_id=b.unit_id and r.data=d.data and (a.produto_venda_ficha_id=b.id or public.abastecimento_nome(o.produto_nome)=public.abastecimento_nome(b.nome_venda))) bloqueado,
 exists(select 1 from public.op_86 o join public.op_relatorio_diario r on r.id=o.relatorio_id left join public.abastecimento_86 a on a.op_86_id=o.id where r.unit_id=b.unit_id and r.data=d.data and a.produto_venda_ficha_id is null and public.abastecimento_nome(o.produto_nome)<>public.abastecimento_nome(b.nome_venda) and similarity(public.abastecimento_nome(o.produto_nome),public.abastecimento_nome(b.nome_venda))>=0.3) ambiguidade
 from pratos b join dias d on d.unit_id=b.unit_id where d.data>=(now() at time zone 'America/Sao_Paulo')::date-400
),vendas as(select w.unit_id,w.data,public.abastecimento_nome(p.produto) nome,sum(p.qtd) qtd,sum(p.total) receita from public.lorean_produtos_dia p join public.lorean_workdays w on w.id=p.workday_id_fk group by 1,2,3)
select b.*,coalesce(v.qtd,0) qtd,coalesce(v.receita,0) receita,b.relatorio_enviado and not b.ambiguidade disponibilidade_conhecida
from base b left join vendas v on v.unit_id=b.unit_id and v.data=b.data and v.nome=public.abastecimento_nome(b.nome_venda);
create view public.v_abastecimento_engenharia as
select unit_id,date_trunc('month',data)::date mes,nome_venda,id produto_venda_ficha_id,count(*) dias_operados,
 count(*)filter(where bloqueado) dias_bloqueados,
 count(*)filter(where disponibilidade_conhecida and not bloqueado) dias_disponiveis,
 bool_and(disponibilidade_conhecida or bloqueado) disponibilidade_conhecida,
 coalesce(sum(qtd)filter(where disponibilidade_conhecida and not bloqueado),0) qtd_disponivel,
 coalesce(sum(receita)filter(where disponibilidade_conhecida and not bloqueado),0) receita_disponivel
from public.v_abastecimento_prato_dia group by 1,2,3,4;
create view public.v_abastecimento_contribuicao as
select d.id produto_venda_ficha_id,d.unit_id,count(*)filter(where d.disponibilidade_conhecida and not d.bloqueado) dias_disponiveis,
 case when count(*)filter(where d.disponibilidade_conhecida and not d.bloqueado)>0
 and bool_and(m.custo_unitario is not null)filter(where d.disponibilidade_conhecida and not d.bloqueado and d.qtd>0)
 then sum(d.receita-d.qtd*m.custo_unitario)filter(where d.disponibilidade_conhecida and not d.bloqueado)/nullif(count(*)filter(where d.disponibilidade_conhecida and not d.bloqueado),0) end contribuicao_dia
from public.v_abastecimento_prato_dia d left join public.mv_prisma_prato_mes m on m.unit_id=d.unit_id and m.nome_venda=d.nome_venda and m.mes=date_trunc('month',d.data)::date
where d.data>=(now() at time zone 'America/Sao_Paulo')::date-90 and d.data<(now() at time zone 'America/Sao_Paulo')::date group by 1,2;
-- Approval is atomic and tied to the request version; one person cannot fill both seats.
create function public.aprovar_retirada_assinatura(p_prato uuid,p_user uuid,p_solicitacao timestamptz) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.cardapio_papel; papel_role text;
begin
 select * into c from public.cardapio_papel where produto_venda_ficha_id=p_prato for update;
 if c.papel is distinct from 'assinatura' or c.retirada_solicitada_em is distinct from p_solicitacao then raise exception 'Solicitação mudou ou não é assinatura.'; end if;
 select case when bool_or(lower(r.name)='founder') then 'founder' when bool_or(lower(r.name) in('chef','chefe de cozinha')) then 'chef' end into papel_role
 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=p_user and (ur.unit_id=c.unit_id or ur.unit_id is null);
 if papel_role is null then raise exception 'Aprovação exige founder ou chef da casa.'; end if;
 insert into public.cardapio_retirada_aprovacao(produto_venda_ficha_id,solicitacao_em,papel_aprovador,aprovador) values(p_prato,p_solicitacao,papel_role,p_user) on conflict do nothing;
 if (select count(distinct papel_aprovador)=2 and count(distinct aprovador)=2 from public.cardapio_retirada_aprovacao where produto_venda_ficha_id=p_prato and solicitacao_em=p_solicitacao) then update public.cardapio_papel set retirada_aprovada_em=now() where produto_venda_ficha_id=p_prato; end if;
end $$;
revoke all on function public.aprovar_retirada_assinatura(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.aprovar_retirada_assinatura(uuid,uuid,timestamptz) to service_role;
-- Weekly operational cohort plus separately labelled current financial snapshot.
create view public.v_abastecimento_kpi as
with semanas as(select u.unit_id,d::date semana from public.everest_unidades u cross join generate_series(date_trunc('week',now() at time zone 'America/Sao_Paulo')-interval '11 weeks',date_trunc('week',now() at time zone 'America/Sao_Paulo'),interval '1 week')d where not u.fora_do_escopo_cmv),fila as(
 select a.*,r.data from public.abastecimento_86 a join public.op_86 o on o.id=a.op_86_id join public.op_relatorio_diario r on r.id=o.relatorio_id
),f as(select a.unit_id,date_trunc('week',a.data)::date semana,count(*) registros,
 count(distinct a.produto_venda_ficha_id)filter(where a.tipo='ruptura' and a.causa_confirmada_em is not null) produtos_ruptura,
 count(*)filter(where a.causa_confirmada_em is not null and nullif(trim(a.responsavel),'') is not null)::numeric/nullif(count(*),0) causa_dono_pct,
 avg(extract(epoch from a.retomada_cozinha_em-a.inicio_confirmado_em)/3600)filter(where a.inicio_confirmado_em is not null and a.retomada_cozinha_em>=a.inicio_confirmado_em) retomada_horas,
 avg(extract(epoch from a.retomada_cozinha_em-a.inicio_confirmado_em)/3600)filter(where p.papel='assinatura' and a.inicio_confirmado_em is not null and a.retomada_cozinha_em>=a.inicio_confirmado_em) retomada_assinatura_horas
 from fila a left join public.cardapio_papel p on p.produto_venda_ficha_id=a.produto_venda_ficha_id group by 1,2),compra as(select unit_id,date_trunc('week',data)::date semana,sum(vl_total) gasto,sum(vl_total)filter(where nullif(trim(nr_pedido),'') is not null and trim(nr_pedido)<>'0') pedido from public.v_prisma_linhas group by 1,2)
select s.*,coalesce(f.registros,0) registros,coalesce(f.produtos_ruptura,0) produtos_ruptura,f.causa_dono_pct,f.retomada_horas,f.retomada_assinatura_horas,c.pedido/nullif(c.gasto,0) com_pedido_pct,
 p.prazo_dias,
 (select sum(t.vl_saldo) from public.v_abastecimento_titulos t where t.unit_id=s.unit_id and t.dias_atraso>0 and exists(select 1 from fila a join public.cardapio_papel cp on cp.produto_venda_ficha_id=a.produto_venda_ficha_id and cp.papel='assinatura' where a.unit_id=s.unit_id and a.fornecedor_raiz=t.fornecedor_raiz)) vencido_assinatura_atual,
 (select m.receita_coberta/nullif(m.receita,0) from public.v_prisma_margem_mes m where m.unit_id=s.unit_id and m.mes=date_trunc('month',s.semana)::date) cobertura_custo_pct,
 (now() at time zone 'America/Sao_Paulo')::date atualizado_em
from semanas s left join f using(unit_id,semana) left join compra c using(unit_id,semana)
left join lateral(select sum((t.dt_vencimento-t.dt_documento)*t.vl_titulo)/nullif(sum(t.vl_titulo),0) prazo_dias from public.everest_titulos_fornecedor t where t.unit_id=s.unit_id and t.at_situacao in(1,9) and t.dt_documento>=s.semana and t.dt_documento<s.semana+7 and t.vl_titulo>0 and t.dt_vencimento>=t.dt_documento)p on true;
revoke all on public.v_abastecimento_titulos,public.v_abastecimento_fila,public.v_abastecimento_prato_dia,public.v_abastecimento_engenharia,public.v_abastecimento_contribuicao,public.v_abastecimento_kpi from public,anon,authenticated;
grant select on public.v_abastecimento_titulos,public.v_abastecimento_fila,public.v_abastecimento_prato_dia,public.v_abastecimento_engenharia,public.v_abastecimento_contribuicao,public.v_abastecimento_kpi to service_role;
notify pgrst,'reload schema';
