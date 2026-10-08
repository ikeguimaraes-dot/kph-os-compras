create table if not exists public.compras_metas_responsavel (
 unit_id uuid not null references public.units(id),
 mes date not null check (extract(day from mes)=1),
 dono text not null check (length(trim(dono)) between 1 and 120),
 economia_meta_rs numeric not null check(economia_meta_rs>=0),
 atualizado_por uuid not null,
 atualizado_em timestamptz not null default now(),
 primary key(unit_id,mes,dono)
);
alter table public.compras_metas_responsavel enable row level security;
revoke all on public.compras_metas_responsavel from anon,authenticated;
grant all on public.compras_metas_responsavel to service_role;
comment on table public.compras_metas_responsavel is 'Metas mensais por responsável e casa; escrita autorizada por founder/diretoria nas Server Actions de Compras.';

