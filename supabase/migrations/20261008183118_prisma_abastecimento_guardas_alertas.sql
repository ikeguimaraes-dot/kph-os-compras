create function public.proteger_papel_assinatura() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.unit_id is distinct from (select unit_id from public.produto_venda_ficha where id=new.produto_venda_ficha_id) then raise exception 'Prato fora da casa.';end if;
 if tg_op='UPDATE' and old.papel='assinatura' and new.papel<>'assinatura' then raise exception 'Assinatura não pode ser reclassificada para contornar a retirada aprovada.';end if;
 if new.retirada_aprovada_em is not null and not exists(select 1 from public.cardapio_retirada_aprovacao where produto_venda_ficha_id=new.produto_venda_ficha_id and solicitacao_em=new.retirada_solicitada_em group by produto_venda_ficha_id having count(distinct aprovador)=2 and count(distinct papel_aprovador)=2) then raise exception 'Retirada exige founder e chef distintos.';end if;
 return new;
end $$;
create trigger proteger_assinatura before insert or update on public.cardapio_papel for each row execute function public.proteger_papel_assinatura();
create function public.proteger_fila_casa() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.unit_id is distinct from(select r.unit_id from public.op_86 o join public.op_relatorio_diario r on r.id=o.relatorio_id where o.id=new.op_86_id) then raise exception 'Registro operacional fora da casa.';end if;
 if new.produto_venda_ficha_id is not null and new.unit_id is distinct from(select unit_id from public.produto_venda_ficha where id=new.produto_venda_ficha_id) then raise exception 'Prato fora da casa.';end if;
 if new.inicio_confirmado_em>now() then raise exception 'Início real não pode estar no futuro.';end if;
 return new;
end $$;
create trigger proteger_fila before insert or update on public.abastecimento_86 for each row execute function public.proteger_fila_casa();
-- An confirmed ongoing event remains unavailable until the kitchen explicitly releases it.
create or replace view public.v_abastecimento_prato_dia as
with dias as(select distinct unit_id,data from public.lorean_workdays),pratos as(select b.id,b.unit_id,b.nome_venda from public.produto_venda_ficha b),base as(
 select b.*,d.data,
 exists(select 1 from public.op_relatorio_diario r where r.unit_id=b.unit_id and r.data=d.data and r.status::text='enviado') relatorio_enviado,
 (exists(select 1 from public.op_86 o join public.op_relatorio_diario r on r.id=o.relatorio_id left join public.abastecimento_86 a on a.op_86_id=o.id where r.unit_id=b.unit_id and r.data=d.data and (a.produto_venda_ficha_id=b.id or public.abastecimento_nome(o.produto_nome)=public.abastecimento_nome(b.nome_venda)))
 or exists(select 1 from public.abastecimento_86 a join public.op_86 o on o.id=a.op_86_id join public.op_relatorio_diario r on r.id=o.relatorio_id where a.unit_id=b.unit_id and a.produto_venda_ficha_id=b.id and a.causa_confirmada_em is not null and d.data>=r.data and (a.retomada_cozinha_em is null or d.data<=(a.retomada_cozinha_em at time zone 'America/Sao_Paulo')::date))) bloqueado,
 exists(select 1 from public.op_86 o join public.op_relatorio_diario r on r.id=o.relatorio_id left join public.abastecimento_86 a on a.op_86_id=o.id where r.unit_id=b.unit_id and r.data=d.data and a.produto_venda_ficha_id is null and public.abastecimento_nome(o.produto_nome)<>public.abastecimento_nome(b.nome_venda) and similarity(public.abastecimento_nome(o.produto_nome),public.abastecimento_nome(b.nome_venda))>=0.3) ambiguidade
 from pratos b join dias d on d.unit_id=b.unit_id where d.data>=(now() at time zone 'America/Sao_Paulo')::date-400
),vendas as(select w.unit_id,w.data,public.abastecimento_nome(p.produto) nome,sum(p.qtd) qtd,sum(p.total) receita from public.lorean_produtos_dia p join public.lorean_workdays w on w.id=p.workday_id_fk group by 1,2,3)
select b.*,coalesce(v.qtd,0) qtd,coalesce(v.receita,0) receita,b.relatorio_enviado and not b.ambiguidade disponibilidade_conhecida
from base b left join vendas v on v.unit_id=b.unit_id and v.data=b.data and v.nome=public.abastecimento_nome(b.nome_venda);
create view public.v_abastecimento_alertas as
with data_ref as(select (now() at time zone 'America/Sao_Paulo')::date dia),venda as(
 select w.unit_id,upper(public.unaccent(trim(p.produto))) nome_venda,max(p.produto) nome,
 sum(p.qtd)filter(where w.data>=d.dia-14) qtd14,sum(p.qtd)filter(where w.data<d.dia-14) qtd28
 from public.lorean_produtos_dia p join public.lorean_workdays w on w.id=p.workday_id_fk cross join data_ref d
 where w.data>=d.dia-42 and w.data<d.dia group by 1,2
),compra as(select unit_id,item_id,raiz_cnpj,max(data) ultima_nota,sum(vl_total) gasto from public.v_prisma_linhas group by 1,2,3)
select distinct on(v.unit_id,v.nome_venda) v.unit_id,d.dia data,'abastecimento'::text tipo,v.nome titulo,b.id::text alvo,
 v.qtd28/2-coalesce(v.qtd14,0) valor,v.qtd28/2 referencia,null::uuid outra_unit_id,
 'Queda de venda, insumo sem nota recente e título vencido. Confirmar causa com operação; não é bloqueio comprovado.'::text detalhe
from venda v join public.produto_venda_ficha b on b.unit_id=v.unit_id and b.nome_venda=v.nome_venda and b.status='confirmado'
join public.mv_prisma_ficha_insumo f on f.unit_id=b.unit_id and f.ficha_id=b.ficha_id
join compra c on c.unit_id=f.unit_id and c.item_id=f.insumo_id cross join data_ref d
where v.qtd28>0 and coalesce(v.qtd14,0)/14<v.qtd28/28*.5 and c.ultima_nota<d.dia-14
and exists(select 1 from public.v_abastecimento_titulos t where t.unit_id=c.unit_id and t.fornecedor_raiz=c.raiz_cnpj and t.dias_atraso>0)
order by v.unit_id,v.nome_venda,c.ultima_nota desc;
revoke all on public.v_abastecimento_alertas from public,anon,authenticated;
grant select on public.v_abastecimento_alertas to service_role;
notify pgrst,'reload schema';
