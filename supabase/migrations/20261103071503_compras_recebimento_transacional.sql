-- Session clients cannot bypass approval and transactional receiving through PostgREST.
-- Draft creation remains in the existing service-only compras_pedido_criar RPC.
revoke insert,update,delete,truncate,references,trigger on public.purchase_orders,public.purchase_order_items from public,anon,authenticated;

create table public.compras_pedido_aprovacoes (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.purchase_orders(id),
 ator uuid not null references auth.users(id), acao text not null check(acao in ('aprovar','registrar_envio','cancelar')),
 evidencia text not null check(length(trim(evidencia))>=3), assinatura text not null, criado_em timestamptz not null default now()
);
create table public.compras_recebimento_conferencias (
 id uuid primary key default gen_random_uuid(), chave uuid not null unique, order_id uuid not null references public.purchase_orders(id),
 unit_id uuid not null references public.units(id), ator uuid not null references auth.users(id),
 documento text not null check(length(trim(documento)) between 3 and 120), observacao text not null,
 entrada jsonb not null, resultado jsonb not null, criado_em timestamptz not null default now()
);
create index on public.compras_pedido_aprovacoes(order_id,criado_em desc);
create index on public.compras_recebimento_conferencias(order_id,criado_em desc);
create unique index compras_recebimento_documento_unico on public.compras_recebimento_conferencias(order_id,lower(btrim(documento)));
do $$ declare t text; begin
 foreach t in array array['compras_pedido_aprovacoes','compras_recebimento_conferencias'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert on public.%I to service_role',t);
  execute format('create policy service_all on public.%I for all to service_role using(true) with check(true)',t);
 end loop;
end $$;

create function public.compras_pedido_assinatura(p_id uuid) returns text
language sql stable security invoker set search_path=public,pg_temp as $$
 select md5(jsonb_build_object('unit',p.unit_id,'supplier',p.supplier_id,'supplier_name',p.fornecedor,'eta',p.data_prevista,
  'items',(select jsonb_agg(jsonb_build_array(i.id,i.nome,i.unidade,i.quantidade,i.preco_unitario) order by i.id) from purchase_order_items i where i.order_id=p.id))::text)
 from purchase_orders p where p.id=p_id
$$;
revoke all on function public.compras_pedido_assinatura(uuid) from public,anon,authenticated;
grant execute on function public.compras_pedido_assinatura(uuid) to service_role;

create function public.compras_pedido_transicao(p_ator uuid,p_id uuid,p_acao text,p_evidencia text)
returns public.purchase_orders language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.purchase_orders; assinatura text; anterior text;
begin
 select * into p from purchase_orders where id=p_id for update;
 if not found then raise exception 'Pedido não encontrado'; end if;
 perform compras_fluxo_autorizar(p_ator,p.unit_id,true);
 if length(trim(coalesce(p_evidencia,'')))<3 then raise exception 'Informe a evidência da decisão'; end if;
 assinatura:=compras_pedido_assinatura(p.id);
 if p_acao='aprovar' and p.status='rascunho' then
  if p.supplier_id is null or p.data_prevista is null or p.data_prevista<(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Confirme fornecedor e previsão de entrega'; end if;
  if not exists(select 1 from suppliers s where s.id=p.supplier_id and s.unit_id=p.unit_id and s.ativo) then raise exception 'Fornecedor inválido para esta casa'; end if;
  if not exists(select 1 from purchase_order_items where order_id=p.id) or exists(select 1 from purchase_order_items where order_id=p.id and (quantidade<=0 or preco_unitario<=0 or nullif(trim(unidade),'') is null)) then raise exception 'Pedido com quantidade, preço ou unidade pendente'; end if;
 elsif p_acao='registrar_envio' and p.status='rascunho' then
  select a.assinatura into anterior from compras_pedido_aprovacoes a where order_id=p.id and acao='aprovar' order by criado_em desc limit 1;
  if anterior is distinct from assinatura then raise exception 'Aprovação ausente ou pedido alterado após a aprovação'; end if;
  update purchase_orders set status='enviado',updated_at=clock_timestamp() where id=p.id returning * into p;
 elsif p_acao='cancelar' and p.status in ('rascunho','enviado','parcial') then
  update purchase_orders set status='cancelado',updated_at=clock_timestamp() where id=p.id returning * into p;
 else raise exception 'Transição não permitida'; end if;
 insert into compras_pedido_aprovacoes(order_id,ator,acao,evidencia,assinatura) values(p.id,p_ator,p_acao,p_evidencia,assinatura);
 return p;
end $$;
revoke all on function public.compras_pedido_transicao(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.compras_pedido_transicao(uuid,uuid,text,text) to service_role;

create function public.compras_recebimento_registrar(p_ator uuid,p_chave uuid,p_pedido uuid,p_documento text,p_observacao text,p_itens jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare p public.purchase_orders; i public.purchase_order_items; antigo public.compras_recebimento_conferencias;
 x jsonb; aceita numeric; recusada numeric; entrada jsonb; resultado jsonb; ids uuid[]:='{}'; preco numeric;
begin
 if p_chave is null or p_ator is null then raise exception 'Identidade obrigatória'; end if;
 perform pg_advisory_xact_lock(hashtextextended('recebimento:'||p_chave,0));
 select * into p from purchase_orders where id=p_pedido for update;
 if not found then raise exception 'Pedido não encontrado'; end if;
 perform compras_fluxo_autorizar(p_ator,p.unit_id);
 entrada:=jsonb_build_object('documento',p_documento,'observacao',p_observacao,'itens',p_itens);
 select * into antigo from compras_recebimento_conferencias where chave=p_chave;
 if found then
  if antigo.ator<>p_ator or antigo.order_id<>p_pedido or antigo.entrada<>entrada then raise exception 'Chave já utilizada por outra conferência'; end if;
  return antigo.resultado;
 end if;
 if p.status not in ('enviado','parcial') then raise exception 'Pedido não está aberto para recebimento'; end if;
 if exists(select 1 from compras_recebimento_conferencias where order_id=p.id and lower(btrim(documento))=lower(btrim(p_documento))) then raise exception 'Este comprovante já foi conferido para o pedido; consulte o histórico'; end if;
 if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) not between 1 and 200 then raise exception 'Conferência sem itens válidos'; end if;
 if length(trim(coalesce(p_documento,'')))<3 then raise exception 'Identifique a nota ou comprovante da entrega'; end if;
 for x in select value from jsonb_array_elements(p_itens) loop
  select * into i from purchase_order_items where id=(x->>'item_id')::uuid and order_id=p.id for update;
  if not found or i.id=any(ids) then raise exception 'Item inválido ou repetido'; end if;
  ids:=array_append(ids,i.id); aceita:=(x->>'aceita')::numeric;recusada:=(x->>'recusada')::numeric;preco:=(x->>'preco_nota')::numeric;
  if aceita is null or recusada is null or aceita<0 or recusada<0 or aceita+recusada<=0 or aceita+recusada>i.quantidade-i.quantidade_recebida
   or aceita>=1e9 or recusada>=1e9 then raise exception 'Quantidade inválida ou superior ao saldo do pedido'; end if;
  if preco is null or preco<0 or preco>=1e9 then raise exception 'Informe o preço unitário da nota'; end if;
  if (recusada>0 or preco<>i.preco_unitario) and length(trim(coalesce(x->>'motivo','')))<3 then raise exception 'Justifique recusa ou divergência de preço'; end if;
  if aceita>0 and (length(trim(coalesce(x->>'lote','')))<1 or nullif(x->>'validade','')::date<(now() at time zone 'America/Sao_Paulo')::date) then raise exception 'Informe lote válido para a mercadoria aceita'; end if;
  update purchase_order_items set quantidade_recebida=quantidade_recebida+aceita where id=i.id;
 end loop;
 update purchase_orders set status=case when exists(select 1 from purchase_order_items where order_id=p.id and quantidade_recebida<quantidade) then 'parcial'::purchase_order_status else 'recebido'::purchase_order_status end,
  updated_at=clock_timestamp() where id=p.id returning * into p;
 resultado:=jsonb_build_object('pedido',to_jsonb(p),'conciliacao_financeira','pendente','estoque_erp','aguardando_conciliacao');
 insert into compras_recebimento_conferencias(chave,order_id,unit_id,ator,documento,observacao,entrada,resultado)
  values(p_chave,p.id,p.unit_id,p_ator,p_documento,coalesce(p_observacao,''),entrada,resultado);
 return resultado;
end $$;
revoke all on function public.compras_recebimento_registrar(uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.compras_recebimento_registrar(uuid,uuid,uuid,text,text,jsonb) to service_role;
