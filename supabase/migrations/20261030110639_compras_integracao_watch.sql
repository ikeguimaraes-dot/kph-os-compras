-- Alertas pontuais de chegada de movimentos. Não altera ingestão nem saldos ERP.
create table public.compras_integracao_watch (
 id uuid primary key default gen_random_uuid(),
 unit_id uuid not null references public.units(id),
 empresa integer not null check (empresa > 0),
 dia date not null,
 user_id uuid not null references auth.users(id),
 email text not null check (email ~ '^[^ @]+@[^ @]+\.[^ @]+$'),
 status text not null default 'pending' check(status in ('pending','found','expired')),
 criado_em timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '48 hours',
 checked_at timestamptz, last_error text,
 lease_id uuid, lease_until timestamptz,
 found_at timestamptz, evidence jsonb,
 notice_title text, notice_message text,
 email_first_attempt_at timestamptz, email_sent_at timestamptz, email_provider_id text, email_error text,
 unique(user_id,unit_id,dia)
);
alter table public.compras_integracao_watch enable row level security;
revoke all on public.compras_integracao_watch from anon,authenticated;
grant select on public.compras_integracao_watch to authenticated;
grant all on public.compras_integracao_watch to service_role;
create policy watch_read_own on public.compras_integracao_watch for select to authenticated using(user_id=auth.uid());

create function public.compras_watch_claim() returns setof public.compras_integracao_watch
language sql security invoker set search_path=public,pg_temp as $$
 update compras_integracao_watch set lease_id=gen_random_uuid(),lease_until=now()+interval '3 minutes'
 where id in (select id from compras_integracao_watch
   where (lease_until is null or lease_until<now())
   and (checked_at is null or checked_at<now()-interval '10 minutes')
   and (status='pending' or (email_sent_at is null and (email_first_attempt_at is null or email_first_attempt_at>now()-interval '20 hours')))
   order by checked_at nulls first,criado_em limit 2 for update skip locked)
 returning *;
$$;

create function public.compras_watch_finish(p_id uuid,p_lease uuid,p_evidence jsonb default null,p_error text default null)
returns public.compras_integracao_watch language plpgsql security invoker set search_path=public,pg_temp as $$
declare w compras_integracao_watch; casa text; n integer; linhas integer;
begin
 select * into w from compras_integracao_watch where id=p_id and lease_id=p_lease for update;
 if not found then raise exception 'Lease inválida'; end if;
 if w.status='pending' then
  if p_error is null and p_evidence is not null then
   if jsonb_typeof(p_evidence)<>'array' or jsonb_array_length(p_evidence)=0 then raise exception 'Evidência inválida'; end if;
   if exists(select 1 from jsonb_array_elements(p_evidence) e where
    (e->>'empresa')::integer is distinct from w.empresa or (e->>'dia')::date is distinct from w.dia
    or (e->>'id')::bigint is null or (e->>'id')::bigint<=0 or (e->>'linhas')::int is null or (e->>'linhas')::int<=0)
   then raise exception 'Evidência fora do escopo'; end if;
   w.status:='found'; w.found_at:=now(); w.evidence:=p_evidence;
  elsif w.expires_at<=now() then w.status:='expired'; end if;
  if w.status<>'pending' then
   select name into casa from units where id=w.unit_id;
   w.notice_title:=casa||' · '||case when w.status='found' then 'baixa de venda encontrada' else 'baixa ainda não confirmada' end;
   if w.status='found' then
    select count(*),sum((e->>'linhas')::int) into n,linhas from jsonb_array_elements(w.evidence) e;
    w.notice_message:=format('Vendas de %s: %s movimento(s), %s linhas, encontrados diretamente na API do Everest. A presença da baixa não comprova conciliação de todas as vendas nem estoque físico.',to_char(w.dia,'DD/MM/YYYY'),n,linhas);
   else
    w.notice_message:=format('O acompanhamento de %s terminou após 48 horas sem confirmar a baixa na API do Everest. Isso não significa que a casa ficou fechada. Consulte a integração e os erros MLO.',to_char(w.dia,'DD/MM/YYYY'));
   end if;
   insert into notifications(id,user_id,tipo,titulo,mensagem,link)
   values(w.id,w.user_id,'integracao_everest',w.notice_title,w.notice_message,'/compras/avisos') on conflict(id) do nothing;
  end if;
 end if;
 update compras_integracao_watch set status=w.status,found_at=w.found_at,evidence=w.evidence,
  notice_title=w.notice_title,notice_message=w.notice_message,checked_at=now(),last_error=left(p_error,300)
 where id=w.id returning * into w;
 return w;
end;
$$;
revoke all on function public.compras_watch_claim(),public.compras_watch_finish(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.compras_watch_claim(),public.compras_watch_finish(uuid,uuid,jsonb,text) to service_role;

-- Token próprio, gerado no banco; nunca aparece no código ou no comando do cron.
do $$ begin
 if not exists(select 1 from vault.secrets where name='compras_integracao_watch_token') then
  perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'compras_integracao_watch_token');
 end if;
end $$;
create function public.compras_watch_cron_token() returns text language sql security definer
set search_path=public,pg_temp as $$ select decrypted_secret from vault.decrypted_secrets where name='compras_integracao_watch_token' $$;
revoke all on function public.compras_watch_cron_token() from public,anon,authenticated;
grant execute on function public.compras_watch_cron_token() to service_role;

create function public.compras_watch_tick() returns bigint language plpgsql security definer
set search_path=public,pg_temp as $$
declare request_id bigint;
begin
 if not exists(select 1 from compras_integracao_watch where status='pending' or
   (email_sent_at is null and (email_first_attempt_at is null or email_first_attempt_at>now()-interval '20 hours'))) then return null; end if;
 select net.http_post(url:='https://kph-os-compras.vercel.app/api/compras/integracao-watch',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||compras_watch_cron_token()),
  body:='{}'::jsonb,timeout_milliseconds:=60000) into request_id;
 return request_id;
end;
$$;
revoke all on function public.compras_watch_tick() from public,anon,authenticated;
grant execute on function public.compras_watch_tick() to service_role;
-- O cron é ativado somente depois do deploy e da verificação autenticada da rota.
