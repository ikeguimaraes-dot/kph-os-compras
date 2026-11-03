-- Operational ledger is separate from the ERP replica. Test records never
-- change real balances. All mutations are transactional and idempotent.
create table public.compras_fluxo_locais (
 id uuid primary key default gen_random_uuid(), unit_id uuid not null references public.units(id),
 modo text not null check(modo in ('teste','real')), nome text not null check(length(trim(nome)) between 2 and 100),
 tipo text not null check(tipo in ('qg','casa','setor')), parent_id uuid references public.compras_fluxo_locais(id),
 criado_em timestamptz not null default now(), unique(unit_id,modo,nome)
);
create table public.compras_fluxo_lotes (
 id uuid primary key default gen_random_uuid(), local_id uuid not null references public.compras_fluxo_locais(id),
 item_id uuid not null references public.everest_itens(id), lote text not null check(length(trim(lote)) between 1 and 100),
 validade date, quantidade numeric not null check(quantidade>=0 and quantidade<1e9),
 reservado numeric not null default 0 check(reservado>=0 and reservado<=quantidade),
 bloqueado boolean not null default false, contado_em timestamptz not null default now(),
 versao integer not null default 1, unique(local_id,item_id,lote)
);
create table public.compras_fluxo_ordens (
 id uuid primary key default gen_random_uuid(), modo text not null check(modo in ('teste','real')),
 tipo text not null check(tipo in ('transferencia','producao')),
 origem_id uuid not null references public.compras_fluxo_locais(id), destino_id uuid not null references public.compras_fluxo_locais(id),
 status text not null default 'rascunho' check(status in ('rascunho','solicitado','aprovado','em_transito','em_producao','parcial','concluido','cancelado')),
 prevista_em date not null, motivo text not null check(length(trim(motivo)) between 3 and 2000),
 criado_por uuid not null references auth.users(id), aprovado_por uuid references auth.users(id),
 criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), versao integer not null default 1,
 check(tipo='producao' or origem_id<>destino_id)
);
create table public.compras_fluxo_itens (
 id uuid primary key default gen_random_uuid(), ordem_id uuid not null references public.compras_fluxo_ordens(id),
 item_id uuid not null references public.everest_itens(id), papel text not null check(papel in ('insumo','produto')),
 quantidade numeric not null check(quantidade>0 and quantidade<1e9),
 recebido numeric not null default 0 check(recebido>=0 and recebido<=quantidade),
 unique(ordem_id,item_id,papel)
);
create table public.compras_fluxo_reservas (
 ordem_id uuid not null references public.compras_fluxo_ordens(id), lote_id uuid not null references public.compras_fluxo_lotes(id),
 quantidade numeric not null check(quantidade>0), primary key(ordem_id,lote_id)
);
create table public.compras_fluxo_eventos (
 id uuid primary key default gen_random_uuid(), chave uuid not null unique,
 ator uuid not null references auth.users(id), acao text not null, modo text not null check(modo in ('teste','real')),
 unit_ids uuid[] not null, entrada jsonb not null, resultado jsonb not null, criado_em timestamptz not null default now()
);
create table public.compras_fluxo_recebimentos (
 id uuid primary key default gen_random_uuid(), ordem_id uuid not null references public.compras_fluxo_ordens(id),
 linha_id uuid not null references public.compras_fluxo_itens(id), origem_lote_id uuid references public.compras_fluxo_lotes(id),
 destino_lote_id uuid not null references public.compras_fluxo_lotes(id), quantidade numeric not null check(quantidade>0),
 ator uuid not null references auth.users(id), criado_em timestamptz not null default now()
);
create index on public.compras_fluxo_lotes(item_id);
create index on public.compras_fluxo_ordens(origem_id,status);
create index on public.compras_fluxo_ordens(destino_id,status);
create index on public.compras_fluxo_eventos using gin(unit_ids);

do $$ declare t text; begin
 foreach t in array array['compras_fluxo_locais','compras_fluxo_lotes','compras_fluxo_ordens','compras_fluxo_itens','compras_fluxo_reservas','compras_fluxo_eventos','compras_fluxo_recebimentos'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update on public.%I to service_role',t);
  execute format('create policy service_all on public.%I for all to service_role using(true) with check(true)',t);
 end loop;
end $$;
grant delete on public.compras_fluxo_reservas to service_role;
revoke update on public.compras_fluxo_eventos,public.compras_fluxo_recebimentos from service_role;

create function public.compras_fluxo_autorizar(p_ator uuid,p_unit uuid,p_aprovar boolean default false)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
  join public.units u on u.id=p_unit where ur.user_id=p_ator and
   (ur.unit_id=u.id or (ur.unit_id is null and ur.brand_id=u.brand_id) or
    (ur.unit_id is null and ur.brand_id is null and ur.group_id is null)) and
   lower(r.name)=any(case when p_aprovar then array['founder','ceo','diretor','cfo','head_financeiro','head_operacao','coo','comprador']
    else array['founder','ceo','diretor','cfo','head_financeiro','head_operacao','coo','comprador','gm','gerente geral','gerente adjunto','chef','chefe de cozinha','chefe de bar','sous chef','operacional','coord. operações'] end))
 then raise exception 'Perfil sem autorização para esta operação e casa'; end if;
end $$;
revoke all on function public.compras_fluxo_autorizar(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.compras_fluxo_autorizar(uuid,uuid,boolean) to service_role;

create function public.compras_fluxo_executar(p_ator uuid,p_chave uuid,p_modo text,p_acao text,p_dados jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare antigo public.compras_fluxo_eventos; origem public.compras_fluxo_locais; destino public.compras_fluxo_locais;
 ordem public.compras_fluxo_ordens; lote public.compras_fluxo_lotes; linha public.compras_fluxo_itens;
 x jsonb; r record; qtd numeric; falta numeric; reservar numeric; resultado jsonb; unidades uuid[]; novo uuid;
begin
 if p_ator is null or p_chave is null or p_modo is null or p_modo not in ('teste','real') or jsonb_typeof(p_dados)<>'object'
  then raise exception 'Solicitação inválida'; end if;
 -- Small operational volume: one transaction lock avoids inter-house lock inversions.
 perform pg_advisory_xact_lock(hashtextextended('compras-fluxo-v1',0));
 select * into antigo from public.compras_fluxo_eventos where chave=p_chave;
 if found then
  if antigo.ator<>p_ator or antigo.modo<>p_modo or antigo.acao<>p_acao or antigo.entrada<>p_dados
   then raise exception 'Chave já utilizada por outra solicitação'; end if;
  foreach novo in array antigo.unit_ids loop perform compras_fluxo_autorizar(p_ator,novo); end loop;
  return antigo.resultado;
 end if;
 if p_acao='local' then
  perform compras_fluxo_autorizar(p_ator,(p_dados->>'unit_id')::uuid,true);
  if nullif(p_dados->>'parent_id','') is not null then
   select * into origem from compras_fluxo_locais where id=(p_dados->>'parent_id')::uuid;
   if not found or origem.unit_id<>(p_dados->>'unit_id')::uuid or origem.modo<>p_modo then raise exception 'Local pai incompatível'; end if;
  end if;
  insert into compras_fluxo_locais(unit_id,modo,nome,tipo,parent_id)
   values((p_dados->>'unit_id')::uuid,p_modo,trim(p_dados->>'nome'),p_dados->>'tipo',nullif(p_dados->>'parent_id','')::uuid) returning id into novo;
  unidades:=array[(p_dados->>'unit_id')::uuid]; resultado:=jsonb_build_object('id',novo);
 elsif p_acao in ('contagem','qualidade') then
  select * into origem from compras_fluxo_locais where id=(p_dados->>'local_id')::uuid and modo=p_modo;
  if not found then raise exception 'Local indisponível'; end if;
  perform compras_fluxo_autorizar(p_ator,origem.unit_id);
  if p_acao='contagem' and not exists(select 1 from everest_itens where id=(p_dados->>'item_id')::uuid and nullif(trim(unidade_medida),'') is not null) then raise exception 'Unidade canônica ausente'; end if;
  if exists(select 1 from compras_estoque_apresentacoes where unit_id=origem.unit_id and insumo_id=(p_dados->>'item_id')::uuid) then raise exception 'Item possui apresentações separadas; use a contagem por apresentação'; end if;
  if length(trim(coalesce(p_dados->>'motivo','')))<3 then raise exception 'Registre a evidência da conferência'; end if;
  select l.* into lote from compras_fluxo_lotes l where l.local_id=origem.id and l.item_id=(p_dados->>'item_id')::uuid and l.lote=p_dados->>'lote' for update;
  if found and lote.versao is distinct from (p_dados->>'versao')::integer then raise exception 'Lote alterado; recarregue a posição'; end if;
  if p_acao='qualidade' then
   if lote.id is null or lote.reservado>0 then raise exception 'Lote ausente ou reservado; cancele a reserva antes de bloquear'; end if;
   update compras_fluxo_lotes set bloqueado=(p_dados->>'bloqueado')::boolean,versao=versao+1 where id=lote.id returning id into novo;
  else
   qtd:=(p_dados->>'quantidade')::numeric;
   if qtd is null or qtd<0 or qtd>=1e9 or qtd<coalesce(lote.reservado,0) then raise exception 'Quantidade inválida ou inferior à reserva'; end if;
   if lote.id is null and coalesce((p_dados->>'versao')::integer,0)<>0 then raise exception 'Lote não encontrado'; end if;
   insert into compras_fluxo_lotes(local_id,item_id,lote,validade,quantidade,bloqueado)
    values(origem.id,(p_dados->>'item_id')::uuid,p_dados->>'lote',nullif(p_dados->>'validade','')::date,qtd,coalesce((p_dados->>'bloqueado')::boolean,false))
    on conflict on constraint compras_fluxo_lotes_local_id_item_id_lote_key do update set quantidade=excluded.quantidade,validade=excluded.validade,
     contado_em=clock_timestamp(),versao=compras_fluxo_lotes.versao+1 returning id into novo;
  end if;
  unidades:=array[origem.unit_id];resultado:=jsonb_build_object('id',novo,'antes',to_jsonb(lote),'depois',(select to_jsonb(l) from compras_fluxo_lotes l where id=novo));
 elsif p_acao='criar_ordem' then
  select * into origem from compras_fluxo_locais where id=(p_dados->>'origem_id')::uuid and modo=p_modo;
  if not found then raise exception 'Origem indisponível'; end if;
  select * into destino from compras_fluxo_locais where id=(p_dados->>'destino_id')::uuid and modo=p_modo;
  if not found then raise exception 'Destino indisponível'; end if;
  perform compras_fluxo_autorizar(p_ator,origem.unit_id);perform compras_fluxo_autorizar(p_ator,destino.unit_id);
  if jsonb_typeof(p_dados->'itens')<>'array' or jsonb_array_length(p_dados->'itens') not between 1 and 100 then raise exception 'Informe de 1 a 100 itens'; end if;
  insert into compras_fluxo_ordens(modo,tipo,origem_id,destino_id,prevista_em,motivo,criado_por)
   values(p_modo,p_dados->>'tipo',origem.id,destino.id,(p_dados->>'prevista_em')::date,p_dados->>'motivo',p_ator) returning * into ordem;
  for x in select value from jsonb_array_elements(p_dados->'itens') loop
   if not exists(select 1 from everest_itens where id=(x->>'item_id')::uuid and nullif(trim(unidade_medida),'') is not null) then raise exception 'Unidade canônica ausente'; end if;
   if exists(select 1 from compras_estoque_apresentacoes where unit_id in (origem.unit_id,destino.unit_id) and insumo_id=(x->>'item_id')::uuid) then raise exception 'Item possui apresentações separadas; não movimentar o saldo agregado'; end if;
   insert into compras_fluxo_itens(ordem_id,item_id,papel,quantidade) values(ordem.id,(x->>'item_id')::uuid,x->>'papel',(x->>'quantidade')::numeric);
  end loop;
  if not exists(select 1 from compras_fluxo_itens where ordem_id=ordem.id and papel='produto') or
   (ordem.tipo='transferencia' and exists(select 1 from compras_fluxo_itens where ordem_id=ordem.id and papel='insumo')) or
   (ordem.tipo='producao' and not exists(select 1 from compras_fluxo_itens where ordem_id=ordem.id and papel='insumo')) then raise exception 'Composição da ordem inválida'; end if;
  unidades:=array[origem.unit_id,destino.unit_id];resultado:=to_jsonb(ordem);
 else
  select * into ordem from compras_fluxo_ordens where id=(p_dados->>'ordem_id')::uuid and modo=p_modo for update;
  if not found then raise exception 'Ordem indisponível'; end if;
  select * into origem from compras_fluxo_locais where id=ordem.origem_id;
  select * into destino from compras_fluxo_locais where id=ordem.destino_id;
  perform compras_fluxo_autorizar(p_ator,origem.unit_id,p_acao in ('aprovar','encerrar_divergencia'));
  perform compras_fluxo_autorizar(p_ator,destino.unit_id,p_acao in ('aprovar','encerrar_divergencia'));
  if ordem.versao is distinct from (p_dados->>'versao')::integer then raise exception 'Ordem alterada; recarregue antes de continuar'; end if;
  if p_acao='solicitar' and ordem.status='rascunho' then ordem.status:='solicitado';
  elsif p_acao='aprovar' and ordem.status='solicitado' then
   for linha in select * from compras_fluxo_itens where ordem_id=ordem.id and papel=case when ordem.tipo='producao' then 'insumo' else 'produto' end order by item_id loop
    if not exists(select 1 from everest_itens where id=linha.item_id and nullif(trim(unidade_medida),'') is not null) then raise exception 'Unidade canônica ausente'; end if;
    falta:=linha.quantidade;
    for lote in select * from compras_fluxo_lotes where local_id=origem.id and item_id=linha.item_id and not bloqueado
     and (validade is null or validade>=ordem.prevista_em) and contado_em>=clock_timestamp()-interval '8 hours'
     and quantidade>reservado order by validade nulls last,contado_em,id for update loop
     reservar:=least(falta,lote.quantidade-lote.reservado);
     insert into compras_fluxo_reservas values(ordem.id,lote.id,reservar);
     update compras_fluxo_lotes set reservado=reservado+reservar,versao=versao+1 where id=lote.id;
     falta:=falta-reservar;exit when falta=0;
    end loop;
    if falta>0 then raise exception 'Saldo conferido, livre e válido insuficiente para reservar'; end if;
   end loop;
   ordem.status:='aprovado';ordem.aprovado_por:=p_ator;
  elsif p_acao='iniciar' and ordem.status='aprovado' then
   for r in select * from compras_fluxo_reservas where ordem_id=ordem.id loop
    select * into lote from compras_fluxo_lotes where id=r.lote_id for update;
    if lote.bloqueado or (lote.validade is not null and lote.validade<(now() at time zone 'America/Sao_Paulo')::date) or lote.contado_em<clock_timestamp()-interval '8 hours' then raise exception 'Reserva vencida ou bloqueada; conferir antes de expedir'; end if;
    update compras_fluxo_lotes set quantidade=quantidade-r.quantidade,reservado=reservado-r.quantidade,versao=versao+1 where id=r.lote_id;
   end loop;
   ordem.status:=case when ordem.tipo='transferencia' then 'em_transito' else 'em_producao' end;
  elsif p_acao='receber' and ordem.status in ('em_transito','em_producao','parcial') then
   select * into linha from compras_fluxo_itens where id=(p_dados->>'linha_id')::uuid and ordem_id=ordem.id and papel='produto' for update;
   qtd:=(p_dados->>'quantidade')::numeric;
   if not found or qtd is null or qtd<=0 or qtd+linha.recebido>linha.quantidade then raise exception 'Recebimento supera o saldo da ordem ou item inválido'; end if;
   if ordem.tipo='transferencia' then
    select l.* into lote from compras_fluxo_lotes l join compras_fluxo_reservas rr on rr.lote_id=l.id
     where rr.ordem_id=ordem.id and l.id=(p_dados->>'origem_lote_id')::uuid and l.item_id=linha.item_id;
    if not found then raise exception 'Informe o lote efetivamente expedido'; end if;
    select rr.quantidade-coalesce((select sum(fr.quantidade) from compras_fluxo_recebimentos fr where fr.ordem_id=ordem.id and fr.origem_lote_id=lote.id),0)
     into falta from compras_fluxo_reservas rr where rr.ordem_id=ordem.id and rr.lote_id=lote.id;
    if qtd>falta then raise exception 'Quantidade superior ao trânsito deste lote'; end if;
    if p_dados->>'lote' is distinct from lote.lote or nullif(p_dados->>'validade','')::date is distinct from lote.validade then raise exception 'Preserve lote e validade da expedição'; end if;
   end if;
   if length(trim(coalesce(p_dados->>'lote','')))<1 or length(trim(coalesce(p_dados->>'motivo','')))<3 then raise exception 'Informe lote e evidência do recebimento'; end if;
   if nullif(p_dados->>'validade','')::date<(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Lote vencido não pode entrar como disponível'; end if;
   select l.* into lote from compras_fluxo_lotes l where l.local_id=destino.id and l.item_id=linha.item_id and l.lote=p_dados->>'lote' for update;
   if found and (lote.bloqueado or lote.validade is distinct from nullif(p_dados->>'validade','')::date) then raise exception 'Lote de destino bloqueado ou com validade divergente'; end if;
   insert into compras_fluxo_lotes(local_id,item_id,lote,validade,quantidade) values(destino.id,linha.item_id,p_dados->>'lote',nullif(p_dados->>'validade','')::date,qtd)
    on conflict on constraint compras_fluxo_lotes_local_id_item_id_lote_key do update set quantidade=compras_fluxo_lotes.quantidade+excluded.quantidade,versao=compras_fluxo_lotes.versao+1 returning id into novo;
   insert into compras_fluxo_recebimentos(ordem_id,linha_id,origem_lote_id,destino_lote_id,quantidade,ator)
    values(ordem.id,linha.id,case when ordem.tipo='transferencia' then (p_dados->>'origem_lote_id')::uuid else null end,novo,qtd,p_ator);
   update compras_fluxo_itens set recebido=recebido+qtd where id=linha.id;
   ordem.status:=case when exists(select 1 from compras_fluxo_itens where ordem_id=ordem.id and papel='produto' and recebido<quantidade) then 'parcial' else 'concluido' end;
  elsif p_acao='encerrar_divergencia' and ordem.status in ('em_transito','em_producao','parcial') then
   if length(trim(coalesce(p_dados->>'motivo','')))<10 then raise exception 'Descreva a perda ou divergência e sua conferência'; end if;
   ordem.status:='concluido';
  elsif p_acao='cancelar' and ordem.status in ('rascunho','solicitado','aprovado') then
   if length(trim(coalesce(p_dados->>'motivo','')))<3 then raise exception 'Informe o motivo do cancelamento'; end if;
   if ordem.status='aprovado' then
    for r in select * from compras_fluxo_reservas where ordem_id=ordem.id loop
     update compras_fluxo_lotes set reservado=reservado-r.quantidade,versao=versao+1 where id=r.lote_id;
    end loop;
    delete from compras_fluxo_reservas where ordem_id=ordem.id;
   end if;
   ordem.status:='cancelado';
  else raise exception 'Transição não permitida'; end if;
  update compras_fluxo_ordens set status=ordem.status,aprovado_por=ordem.aprovado_por,versao=versao+1,atualizado_em=clock_timestamp() where id=ordem.id returning * into ordem;
  unidades:=array[origem.unit_id,destino.unit_id];resultado:=to_jsonb(ordem);
 end if;
 insert into compras_fluxo_eventos(chave,ator,acao,modo,unit_ids,entrada,resultado) values(p_chave,p_ator,p_acao,p_modo,unidades,p_dados,resultado);
 return resultado;
end $$;
revoke all on function public.compras_fluxo_executar(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.compras_fluxo_executar(uuid,uuid,text,text,jsonb) to service_role;
