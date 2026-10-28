-- F1: identidade confirmada, confirmações completas/parciais e histórico append-only.
-- Leitura/escrita somente service_role; APIs autenticadas ficam para a F3.
create table public.posicao_86_item (
 id uuid primary key default gen_random_uuid(), unit_id uuid not null references public.units(id),
 chave text not null, nome text not null, natureza text not null check(natureza in ('produto','base','insumo','sem_identificacao')),
 produto_id uuid references public.produto_venda_ficha(id), insumo_id uuid references public.everest_itens(id),
 validado_por text not null, validado_em timestamptz not null default now(),
 pendencia text, unique(unit_id,chave), unique(id,unit_id),
 check ((natureza='produto' and produto_id is not null) or (natureza<>'produto' and produto_id is null)),
 check(natureza<>'sem_identificacao' or (insumo_id is null and pendencia is not null))
);
create table public.posicao_86_afetado (
 id uuid primary key default gen_random_uuid(), item_id uuid not null, unit_id uuid not null,
 produto_id uuid references public.produto_venda_ficha(id), ficha_id uuid references public.everest_fichas_tecnicas(id),
 destino text not null check(destino in ('salao','eventos')), vinculo_ficha_pendente boolean not null,
 fonte text not null check(fonte in ('confirmacao_usuario','ficha_nivel_1','ficha_nivel_2')),
 foreign key(item_id,unit_id) references public.posicao_86_item(id,unit_id),
 check(produto_id is not null or (destino='eventos' and ficha_id is not null)),
 unique(item_id,produto_id), unique(item_id,ficha_id)
);
create table public.posicao_86_confirmacao (
 id uuid primary key default gen_random_uuid(), unit_id uuid not null references public.units(id),
 chave text not null, lista_completa boolean not null, confirmado_em timestamptz not null,
 registrado_em timestamptz not null default clock_timestamp(), registrado_por text not null check(length(trim(registrado_por))>0),
 payload jsonb not null, unique(unit_id,chave), unique(id,unit_id)
);
create table public.posicao_86_evento (
 id bigint generated always as identity primary key, confirmacao_id uuid not null, unit_id uuid not null,
 item_id uuid not null, evento text not null check(evento in ('abertura','atualizacao','retorno')),
 tipo smallint not null check(tipo in (85,86)),
 motivo text not null check(motivo in ('sazonalidade','compra','producao','fora_do_padrao','ruptura_fornecedor','nao_informado','outro')),
 motivo_anterior text, motivo_alterado boolean not null default false,
 foreign key(confirmacao_id,unit_id) references public.posicao_86_confirmacao(id,unit_id),
 foreign key(item_id,unit_id) references public.posicao_86_item(id,unit_id), unique(confirmacao_id,item_id)
);
create index on public.posicao_86_confirmacao(unit_id,confirmado_em desc);
create index on public.posicao_86_evento(unit_id,item_id,id desc);

create function public.posicao_86_imutavel() returns trigger language plpgsql set search_path=public as $$
begin raise exception 'Histórico/identidade imutável: registre nova confirmação ou nova identidade'; end $$;
create function public.posicao_86_validar_identidade() returns trigger language plpgsql set search_path=public as $$
begin
 if new.produto_id is not null and not exists(select 1 from produto_venda_ficha where id=new.produto_id and unit_id=new.unit_id) then
  raise exception 'Produto de outra casa';
 end if;
 if tg_table_name='posicao_86_afetado' then
  if exists(select 1 from posicao_86_item where id=new.item_id and natureza='sem_identificacao') then raise exception 'Item sem identificação não pode afetar produto'; end if;
  if new.ficha_id is not null and not exists(select 1 from v_ponte_fichas where ficha_id=new.ficha_id and unit_id=new.unit_id) then raise exception 'Ficha não validada para esta casa'; end if;
  if new.produto_id is not null and exists(select 1 from produto_venda_ficha where id=new.produto_id and nome_venda like 'EVA %') and new.destino<>'eventos' then raise exception 'EVA não pertence ao salão'; end if;
 end if;
 return new;
end $$;
create trigger validar_item before insert on public.posicao_86_item for each row execute function public.posicao_86_validar_identidade();
create trigger validar_afetado before insert on public.posicao_86_afetado for each row execute function public.posicao_86_validar_identidade();
do $$ declare t text; begin
 foreach t in array array['posicao_86_item','posicao_86_afetado','posicao_86_confirmacao','posicao_86_evento'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select, insert on public.%I to service_role',t);
 execute format('create trigger imutavel before update or delete on public.%I for each row execute function public.posicao_86_imutavel()',t);
 execute format('create trigger sem_truncate before truncate on public.%I for each statement execute function public.posicao_86_imutavel()',t);
 end loop;
end $$;
grant usage, select on sequence public.posicao_86_evento_id_seq to service_role;

-- Último evento por identidade, em tempo operacional (registrado_em preserva a auditoria da carga).
create function public.posicao_86_em(p_em timestamptz)
returns table(unit_id uuid,item_id uuid,evento_id bigint,tipo smallint,motivo text,motivo_alterado boolean,confirmado_em timestamptz)
language sql stable security invoker set search_path=public as $$
 select unit_id,item_id,id,tipo,motivo,motivo_alterado,confirmado_em from (
 select distinct on(e.unit_id,e.item_id) e.*,c.confirmado_em
 from posicao_86_evento e join posicao_86_confirmacao c on c.id=e.confirmacao_id
 where c.confirmado_em<=p_em order by e.unit_id,e.item_id,c.confirmado_em desc,e.id desc
 ) s where evento<>'retorno'
$$;

create function public.confirmar_posicao_86(p_unit uuid,p_chave text,p_em timestamptz,p_completa boolean,p_por text,p_itens jsonb)
returns uuid language plpgsql security invoker set search_path=public as $$
declare cid uuid; anterior posicao_86_confirmacao; j jsonb; it posicao_86_item; atual record; acao text; v_tipo smallint; v_motivo text;
begin
 if p_em is null or p_completa is null or p_chave is null or length(trim(p_chave))=0 or p_por is null or length(trim(p_por))=0 or jsonb_typeof(p_itens) is distinct from 'array' then raise exception 'Confirmação inválida'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_unit::text,86));
 select * into anterior from posicao_86_confirmacao where unit_id=p_unit and chave=p_chave;
 if found then
  if anterior.confirmado_em=p_em and anterior.lista_completa=p_completa and anterior.registrado_por=p_por and anterior.payload=p_itens then return anterior.id; end if;
  raise exception 'Chave idempotente reutilizada com conteúdo diferente';
 end if;
 if exists(select 1 from posicao_86_confirmacao where unit_id=p_unit and confirmado_em>p_em) then raise exception 'Confirmação retroativa após posição mais recente'; end if;
 if (select count(*)<>count(distinct value->>'item_id') from jsonb_array_elements(p_itens)) then raise exception 'Item duplicado ou sem identidade operacional'; end if;
 insert into posicao_86_confirmacao(unit_id,chave,lista_completa,confirmado_em,registrado_por,payload) values(p_unit,p_chave,p_completa,p_em,p_por,p_itens) returning id into cid;
 for j in select value from jsonb_array_elements(p_itens) loop
  select * into strict it from posicao_86_item where id=(j->>'item_id')::uuid and unit_id=p_unit;
  acao:=coalesce(j->>'acao','abrir'); v_tipo:=(j->>'tipo')::smallint; v_motivo:=j->>'motivo';
  if acao not in ('abrir','retornar') or (p_completa and acao='retornar') then raise exception 'Ação inválida para lista'; end if;
  if v_tipo=85 and it.natureza='produto' then raise exception '85 deve apontar para insumo/base'; end if;
  select * into atual from posicao_86_em(p_em) where unit_id=p_unit and item_id=it.id;
  if acao='retornar' and atual.item_id is null then raise exception 'Retorno exige item aberto'; end if;
  insert into posicao_86_evento(confirmacao_id,unit_id,item_id,evento,tipo,motivo,motivo_anterior,motivo_alterado)
  values(cid,p_unit,it.id,case when acao='retornar' then 'retorno' when atual.item_id is null then 'abertura' else 'atualizacao' end,v_tipo,v_motivo,atual.motivo,atual.item_id is not null and atual.motivo is distinct from v_motivo);
 end loop;
 if p_completa then
  insert into posicao_86_evento(confirmacao_id,unit_id,item_id,evento,tipo,motivo,motivo_anterior)
  select cid,p_unit,s.item_id,'retorno',s.tipo,s.motivo,s.motivo from posicao_86_em(p_em) s
  where s.unit_id=p_unit and not exists(select 1 from jsonb_array_elements(p_itens) omitted(value) where (omitted.value->>'item_id')::uuid=s.item_id);
 end if;
 return cid;
end $$;

create function public.posicao_86_resumo_em(p_em timestamptz)
returns table(unit_id uuid,casa text,ultima_confirmacao timestamptz,status text,itens jsonb,n_86 bigint,n_85 bigint)
language sql stable security invoker set search_path=public as $$
 select u.id,u.name::text,c.ultima,
 case when c.ultima is null then 'sem_confirmacao' when p_em-c.ultima>interval '6 hours' then 'desatualizado' else 'atualizado' end,
 coalesce(a.itens,'[]'::jsonb),coalesce(a.n86,0),coalesce(a.n85,0)
 from units u
 left join lateral(select max(confirmado_em) ultima from posicao_86_confirmacao where unit_id=u.id and lista_completa and confirmado_em<=p_em)c on true
 left join lateral(
 select jsonb_agg(jsonb_build_object('item_id',s.item_id,'nome',i.nome,'identidade',i.natureza,'tipo',s.tipo,'motivo',s.motivo,'motivo_alterado',s.motivo_alterado,'pendencia',i.pendencia,
 'afetados',case when s.tipo=85 then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('produto_id',a.produto_id,'ficha_id',a.ficha_id,'destino',a.destino,'vinculo_ficha_pendente',a.vinculo_ficha_pendente)) from posicao_86_afetado a where a.item_id=i.id),'[]'::jsonb) end) order by i.nome) itens,
 count(*) filter(where s.tipo=86) n86,count(*) filter(where s.tipo=85) n85
 from posicao_86_em(p_em)s join posicao_86_item i on i.id=s.item_id where s.unit_id=u.id
 )a on true where exists(select 1 from posicao_86_item where unit_id=u.id)
$$;
create view public.posicao_86_atual with(security_invoker=true) as select * from public.posicao_86_resumo_em(now());
revoke all on public.posicao_86_atual from anon,authenticated;
grant select on public.posicao_86_atual to service_role;
revoke all on function public.confirmar_posicao_86(uuid,text,timestamptz,boolean,text,jsonb),public.posicao_86_em(timestamptz),public.posicao_86_resumo_em(timestamptz) from public,anon,authenticated;
grant execute on function public.confirmar_posicao_86(uuid,text,timestamptz,boolean,text,jsonb),public.posicao_86_em(timestamptz),public.posicao_86_resumo_em(timestamptz) to service_role;
comment on view public.posicao_86_atual is 'Fonte única operacional F1. 85 separado; EVA apenas risco. F2/F3 migrarão consumidores legados. Parcial não renova confirmação completa da casa.';
