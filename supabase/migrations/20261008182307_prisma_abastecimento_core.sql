create type public.abastecimento_causa as enum ('fornecedor_bloqueado_pagamento','pedido_nao_feito','atraso_entrega','indisponivel_mercado','qualidade_reprovada','erro_estoque','producao_planejamento','sazonalidade');
create table public.abastecimento_config (
 id boolean primary key default true check(id),teto_caixa_7d numeric check(teto_caixa_7d>=0),inicio date,
 fator_migracao numeric not null default 0.6 check(fator_migracao between 0 and 1),dono_fila text,
 atualizado_por uuid references auth.users,atualizado_em timestamptz not null default now()
);
insert into public.abastecimento_config(id) values(true);
create table public.abastecimento_86 (
 id uuid primary key default gen_random_uuid(),op_86_id uuid not null unique references public.op_86(id) on delete cascade,
 unit_id uuid not null references public.units,produto_venda_ficha_id uuid references public.produto_venda_ficha,
 tipo text check(tipo in('planejado','ruptura','qualidade','sazonalidade')),causa public.abastecimento_causa,
 insumo_id uuid references public.everest_itens,fornecedor_raiz text,responsavel text,proxima_acao text,prazo date,previsao_retorno date,
 status text not null default 'aberto' check(status in('aberto','causa_confirmada','acordo_em_negociacao','aguardando_entrega','retomado','planejado')),
 sugestao_prato_id uuid references public.produto_venda_ficha,sugestao_insumo_id uuid references public.everest_itens,sugestao_fornecedor_raiz text,
 sugestao_causa public.abastecimento_causa,sugestao_detalhe text,
 inicio_confirmado_em timestamptz,causa_confirmada_por uuid references auth.users,causa_confirmada_em timestamptz,
 retomada_cozinha_em timestamptz,retomada_cozinha_por uuid references auth.users,retomada_pdv_em timestamptz,
 criado_por uuid references auth.users,criado_em timestamptz not null default now(),atualizado_em timestamptz not null default now(),
 check(status='aberto' or (tipo is not null and causa is not null and produto_venda_ficha_id is not null and nullif(trim(responsavel),'') is not null and nullif(trim(proxima_acao),'') is not null and prazo is not null and previsao_retorno is not null)),
 check(status<>'retomado' or (retomada_cozinha_em is not null and retomada_pdv_em is not null))
);
create index on public.abastecimento_86(unit_id,status);
create index on public.abastecimento_86(unit_id,produto_venda_ficha_id);
create table public.cardapio_papel (
 produto_venda_ficha_id uuid primary key references public.produto_venda_ficha,unit_id uuid not null references public.units,
 papel text not null check(papel in('assinatura','nucleo','complemento')),aprovado_por uuid not null references auth.users,aprovado_em timestamptz not null default now(),
 retirada_solicitada_em timestamptz,retirada_aprovada_em timestamptz,retirada_motivo text
);
create table public.cardapio_retirada_aprovacao (
 produto_venda_ficha_id uuid not null references public.cardapio_papel,solicitacao_em timestamptz not null,
 papel_aprovador text not null check(papel_aprovador in('founder','chef')),aprovador uuid not null references auth.users,aprovado_em timestamptz not null default now(),
 primary key(produto_venda_ficha_id,solicitacao_em,papel_aprovador),unique(produto_venda_ficha_id,solicitacao_em,aprovador)
);
create table public.abastecimento_acordo (
 id uuid primary key default gen_random_uuid(),unit_id uuid not null references public.units,fornecedor_raiz text not null,
 pratos_liberados uuid[] not null check(cardinality(pratos_liberados)>0),entrada_divida_rs numeric not null check(entrada_divida_rs>=0),compra_nova_rs numeric not null check(compra_nova_rs>=0),frete_rs numeric not null default 0 check(frete_rs>=0),
 desembolso_total_rs numeric generated always as(entrada_divida_rs+compra_nova_rs+frete_rs) stored,
 data_entrega date,entrega_confirmada boolean not null default false,qualidade_confirmada boolean not null default false,
 todos_insumos_confirmados boolean not null default false,quantidade_confirmada text,alternativa_homologada text,
 prazo_recebimento_dias integer not null default 0 check(prazo_recebimento_dias between 0 and 365),
 contribuicao_recuperavel_7d numeric,contribuicao_recuperavel_14d numeric,
 status text not null default 'rascunho' check(status in('rascunho','em_negociacao','validado','descartado','concluido')),
 criado_por uuid not null references auth.users,criado_em timestamptz not null default now(),atualizado_em timestamptz not null default now()
);
create index on public.abastecimento_acordo(unit_id,status);
create table public.compras_matriz_marcas (
 id uuid primary key default gen_random_uuid(),produto text not null unique,categoria text,unidade text,marca_atual text,marcas text[] not null default '{}',observacao text,fonte text,
 item_id uuid references public.everest_itens,ligacao_origem text check(ligacao_origem in('exata','manual')),ligado_por uuid references auth.users,ligado_em timestamptz,importado_em timestamptz not null default now()
);
create table public.compras_cotacao_distribuidor (
 id uuid primary key default gen_random_uuid(),matriz_id uuid not null references public.compras_matriz_marcas,
 distribuidor text not null check(distribuidor in('Bidfood','Vinhais','Aroumar','MegaG','PMG')),preco numeric check(preco>0),
 quantidade_utilizavel numeric check(quantidade_utilizavel>0),marca text,frete numeric check(frete>=0),pedido_minimo numeric check(pedido_minimo>=0),validade date,
 prazo_dias integer check(prazo_dias>=0),credito_disponivel numeric check(credito_disponivel>=0),confiabilidade_pct numeric check(confiabilidade_pct between 0 and 100),
 homologado boolean not null default false,observacao text,atualizado_por uuid references auth.users,atualizado_em timestamptz not null default now(),unique(matriz_id,distribuidor)
);
-- All access is through authenticated, unit-scoped server actions.
do $$declare t text;begin foreach t in array array['abastecimento_config','abastecimento_86','cardapio_papel','cardapio_retirada_aprovacao','abastecimento_acordo','compras_matriz_marcas','compras_cotacao_distribuidor'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('create policy servico on public.%I for all to service_role using(true) with check(true)',t);
end loop;end $$;
create function public.abastecimento_nome(n text) returns text language sql immutable set search_path=public,pg_temp as $$select upper(regexp_replace(public.unaccent(trim(n)),'[^a-zA-Z0-9]+',' ','g'))$$;
create view public.v_abastecimento_titulos as
select t.id,t.unit_id,t.nr_titulo,t.nr_nota,t.nr_parcela,t.dt_documento,t.dt_vencimento,t.vl_saldo,t.vl_titulo,t.at_situacao,
 case when length(regexp_replace(f.cpf_cnpj,'\D','','g'))=14 then left(regexp_replace(f.cpf_cnpj,'\D','','g'),8) when length(regexp_replace(f.cpf_cnpj,'\D','','g'))=11 then regexp_replace(f.cpf_cnpj,'\D','','g') else 'sem-cnpj:'||f.id::text end fornecedor_raiz,
 coalesce(f.nome_fantasia,f.razao_social,t.fornecedor_nome) fornecedor_nome,
 greatest(0,(now() at time zone 'America/Sao_Paulo')::date-t.dt_vencimento) dias_atraso,
 (now() at time zone 'America/Sao_Paulo')::date-t.dt_vencimento>60 conciliar
from public.everest_titulos_fornecedor t left join public.everest_fornecedores f on f.id=t.fornecedor_id where t.at_situacao=1 and t.vl_saldo>0;
