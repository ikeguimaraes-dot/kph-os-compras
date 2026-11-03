create table public.compras_fluxo_politicas (
 unit_id uuid not null references public.units(id),item_id uuid not null references public.everest_itens(id),
 modo text not null check(modo in ('bloqueado','simulacao')),fornecedor_id uuid references public.suppliers(id),
 preco_unitario numeric check(preco_unitario>0 and preco_unitario<1e9),cotacao_valida_ate date,
 limite_valor numeric not null check(limite_valor>0 and limite_valor<1e9),limite_quantidade numeric not null check(limite_quantidade>0 and limite_quantidade<1e9),
 embalagem numeric not null check(embalagem>0 and embalagem<1e9),minimo_embalagens integer not null check(minimo_embalagens between 0 and 10000),
 seguranca numeric not null check(seguranca>=0 and seguranca<1e9),lead_dias integer not null check(lead_dias between 0 and 60),
 porcao_minima numeric not null check(porcao_minima>0 and porcao_minima<1e9),
 evidencia text not null,ator uuid not null references auth.users(id),versao integer not null default 1,atualizado_em timestamptz not null default now(),
 primary key(unit_id,item_id)
);
create table public.compras_operacao_tratativas (
 unit_id uuid not null references public.units(id),chave text not null check(length(chave) between 1 and 200),
 responsavel text not null check(length(trim(responsavel)) between 2 and 150),prazo date not null,
 estado text not null check(estado in ('aberta','em_tratamento','evidencia_registrada')),
 evidencia text not null,ator uuid not null references auth.users(id),versao integer not null default 1,atualizado_em timestamptz not null default now(),
 primary key(unit_id,chave)
);
create table public.compras_operacao_decisoes (
 id uuid primary key default gen_random_uuid(),unit_id uuid not null references public.units(id),ator uuid not null references auth.users(id),
 acao text not null,entrada jsonb not null,criado_em timestamptz not null default now()
);
create table public.compras_recebimento_destinos (
 conferencia_id uuid not null references public.compras_recebimento_conferencias(id),pedido_item_id uuid not null references public.purchase_order_items(id),
 local_id uuid not null references public.compras_fluxo_locais(id),item_id uuid not null references public.everest_itens(id),
 fator numeric not null check(fator>0 and fator<1e9),quantidade numeric not null check(quantidade>0 and quantidade<1e9),
 lote_id uuid not null references public.compras_fluxo_lotes(id),ator uuid not null references auth.users(id),evidencia text not null,criado_em timestamptz not null default now(),
 primary key(conferencia_id,pedido_item_id)
);
create index on public.compras_operacao_decisoes(unit_id,criado_em desc);
do $$ declare t text; begin
 foreach t in array array['compras_fluxo_politicas','compras_operacao_tratativas','compras_operacao_decisoes','compras_recebimento_destinos'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert on public.%I to service_role',t);
  execute format('create policy service_all on public.%I for all to service_role using(true) with check(true)',t);
 end loop;
end $$;
grant update on public.compras_fluxo_politicas,public.compras_operacao_tratativas to service_role;

create function public.compras_operacao_configurar(p_ator uuid,p_unit uuid,p_acao text,p_dados jsonb) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare atual integer;
begin
 perform compras_fluxo_autorizar(p_ator,p_unit,true);
 perform pg_advisory_xact_lock(hashtextextended('compras-config:'||p_unit,0));
 if length(trim(coalesce(p_dados->>'evidencia','')))<3 then raise exception 'Registre a evidência'; end if;
 if p_acao='politica' then
  select versao into atual from compras_fluxo_politicas where unit_id=p_unit and item_id=(p_dados->>'item_id')::uuid;
  if coalesce(atual,0) is distinct from (p_dados->>'versao')::integer then raise exception 'Política alterada; recarregue'; end if;
  if nullif(p_dados->>'fornecedor_id','') is not null and not exists(select 1 from suppliers where id=(p_dados->>'fornecedor_id')::uuid and unit_id=p_unit and ativo) then raise exception 'Fornecedor incompatível'; end if;
  insert into compras_fluxo_politicas(unit_id,item_id,modo,fornecedor_id,preco_unitario,cotacao_valida_ate,limite_valor,limite_quantidade,embalagem,minimo_embalagens,seguranca,lead_dias,porcao_minima,evidencia,ator)
   values(p_unit,(p_dados->>'item_id')::uuid,p_dados->>'modo',nullif(p_dados->>'fornecedor_id','')::uuid,nullif(p_dados->>'preco_unitario','')::numeric,nullif(p_dados->>'cotacao_valida_ate','')::date,
   (p_dados->>'limite_valor')::numeric,(p_dados->>'limite_quantidade')::numeric,(p_dados->>'embalagem')::numeric,(p_dados->>'minimo_embalagens')::integer,(p_dados->>'seguranca')::numeric,(p_dados->>'lead_dias')::integer,(p_dados->>'porcao_minima')::numeric,p_dados->>'evidencia',p_ator)
   on conflict(unit_id,item_id) do update set modo=excluded.modo,fornecedor_id=excluded.fornecedor_id,preco_unitario=excluded.preco_unitario,cotacao_valida_ate=excluded.cotacao_valida_ate,
    limite_valor=excluded.limite_valor,limite_quantidade=excluded.limite_quantidade,embalagem=excluded.embalagem,minimo_embalagens=excluded.minimo_embalagens,seguranca=excluded.seguranca,lead_dias=excluded.lead_dias,
    porcao_minima=excluded.porcao_minima,evidencia=excluded.evidencia,ator=p_ator,versao=compras_fluxo_politicas.versao+1,atualizado_em=clock_timestamp();
 elsif p_acao='tratativa' then
  select versao into atual from compras_operacao_tratativas where unit_id=p_unit and chave=p_dados->>'chave';
  if coalesce(atual,0) is distinct from (p_dados->>'versao')::integer then raise exception 'Tratativa alterada; recarregue'; end if;
  insert into compras_operacao_tratativas(unit_id,chave,responsavel,prazo,estado,evidencia,ator)
   values(p_unit,p_dados->>'chave',p_dados->>'responsavel',(p_dados->>'prazo')::date,p_dados->>'estado',p_dados->>'evidencia',p_ator)
   on conflict(unit_id,chave) do update set responsavel=excluded.responsavel,prazo=excluded.prazo,estado=excluded.estado,evidencia=excluded.evidencia,ator=p_ator,versao=compras_operacao_tratativas.versao+1,atualizado_em=clock_timestamp();
 else raise exception 'Operação desconhecida'; end if;
 insert into compras_operacao_decisoes(unit_id,ator,acao,entrada) values(p_unit,p_ator,p_acao,p_dados);
end $$;
revoke all on function public.compras_operacao_configurar(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.compras_operacao_configurar(uuid,uuid,text,jsonb) to service_role;

create function public.compras_recebimento_destinar(p_ator uuid,p_conferencia uuid,p_linha uuid,p_local uuid,p_item uuid,p_fator numeric,p_evidencia text) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.compras_recebimento_conferencias;l public.compras_fluxo_locais;antigo public.compras_recebimento_destinos;b public.compras_fluxo_lotes;x jsonb;q numeric;novo uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('compras-fluxo-v1',0));
 select * into c from compras_recebimento_conferencias where id=p_conferencia;
 if not found then raise exception 'Conferência indisponível'; end if;
 perform compras_fluxo_autorizar(p_ator,c.unit_id,true);
 select * into antigo from compras_recebimento_destinos where conferencia_id=p_conferencia and pedido_item_id=p_linha;
 if found then
  if antigo.local_id<>p_local or antigo.item_id<>p_item or antigo.fator<>p_fator then raise exception 'Conferência já destinada com outro vínculo'; end if;
  return antigo.lote_id;
 end if;
 select * into l from compras_fluxo_locais where id=p_local and modo='real' and unit_id=c.unit_id;
 if not found then raise exception 'Selecione um local real da casa do pedido'; end if;
 if p_fator is null or p_fator<=0 or p_fator>=1e9 or length(trim(coalesce(p_evidencia,'')))<3 then raise exception 'Confirme o fator e a evidência de conversão'; end if;
 if not exists(select 1 from everest_itens where id=p_item and nullif(trim(unidade_medida),'') is not null) then raise exception 'Unidade canônica pendente'; end if;
 if exists(select 1 from compras_estoque_apresentacoes where unit_id=c.unit_id and insumo_id=p_item) then raise exception 'Item possui apresentações separadas; concilie na tela de apresentações'; end if;
 select value into x from jsonb_array_elements(c.entrada->'itens') where value->>'item_id'=p_linha::text;
 q:=(x->>'aceita')::numeric*p_fator;
 if q is null or q<=0 or q>=1e9 then raise exception 'Quantidade aceita inválida'; end if;
 select * into b from compras_fluxo_lotes where local_id=p_local and item_id=p_item and lote=x->>'lote' for update;
 if found and (b.bloqueado or b.validade is distinct from nullif(x->>'validade','')::date) then raise exception 'Lote bloqueado ou validade divergente'; end if;
 if b.id is not null and b.contado_em>c.criado_em then raise exception 'Há contagem posterior ao recebimento; concilie a diferença pela recontagem para evitar duplicidade'; end if;
 insert into compras_fluxo_lotes(local_id,item_id,lote,validade,quantidade,contado_em)
  values(p_local,p_item,x->>'lote',nullif(x->>'validade','')::date,q,c.criado_em)
  on conflict(local_id,item_id,lote) do update set quantidade=compras_fluxo_lotes.quantidade+excluded.quantidade,versao=compras_fluxo_lotes.versao+1 returning id into novo;
 insert into compras_recebimento_destinos(conferencia_id,pedido_item_id,local_id,item_id,fator,quantidade,lote_id,ator,evidencia)
  values(p_conferencia,p_linha,p_local,p_item,p_fator,q,novo,p_ator,p_evidencia);
 insert into compras_operacao_decisoes(unit_id,ator,acao,entrada) values(c.unit_id,p_ator,'destinar_recebimento',jsonb_build_object('conferencia',p_conferencia,'linha',p_linha,'item',p_item,'local',p_local,'fator',p_fator,'quantidade',q,'evidencia',p_evidencia));
 return novo;
end $$;
revoke all on function public.compras_recebimento_destinar(uuid,uuid,uuid,uuid,uuid,numeric,text) from public,anon,authenticated;
grant execute on function public.compras_recebimento_destinar(uuid,uuid,uuid,uuid,uuid,numeric,text) to service_role;

create function public.compras_operacao_recalcular(p_ator uuid,p_unit uuid) returns timestamptz
language plpgsql security invoker set search_path=public,pg_temp set statement_timeout='50s' as $$
declare v jsonb;t timestamptz:=clock_timestamp();
begin
 perform compras_fluxo_autorizar(p_ator,p_unit,true);
 if not pg_try_advisory_xact_lock(hashtextextended('compras-recalcular:'||p_unit,0)) then raise exception 'Consolidação já em andamento'; end if;
 if not exists(select 1 from units where id=p_unit and active and not is_training and lorean_code is not null) then raise exception 'Casa fora do escopo operacional'; end if;
 if exists(select 1 from compras_automacao_execucao where unit_id=p_unit and criado_em>now()-interval '5 minutes') then raise exception 'Consolidação recente; aguarde cinco minutos para recalcular'; end if;
 v:=compras_automacao_base(array[p_unit]);
 insert into compras_automacao_execucao(unit_id,referencia,versao,resultado,chave)
  values(p_unit,(now() at time zone 'America/Sao_Paulo')::date,'base-everest-v2',v,'operacao:'||gen_random_uuid());
 insert into compras_operacao_decisoes(unit_id,ator,acao,entrada) values(p_unit,p_ator,'recalcular',jsonb_build_object('iniciado_em',t));
 return clock_timestamp();
end $$;
revoke all on function public.compras_operacao_recalcular(uuid,uuid) from public,anon,authenticated;
grant execute on function public.compras_operacao_recalcular(uuid,uuid) to service_role;
