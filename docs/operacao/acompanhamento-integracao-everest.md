# Acompanhamento pontual de integração Everest

O aviso comprova a presença de um movimento confirmado de origem `VENDA DO DIA (INTEGRACAO PDV)`, com itens, na empresa e data cadastradas. Não comprova conciliação integral do faturamento, estoque físico ou disponibilidade 85/86.

## Operação

- Cadastro administrativo na tabela `compras_integracao_watch`, com empresa, unidade, data, usuário e destinatário. Não há formulário público de cadastro.
- O cron `compras-integracao-watch` executa `compras_watch_tick()` a cada 15 minutos. Sem acompanhamentos elegíveis, não chama o worker.
- A rota Node `/api/compras/integracao-watch` aceita apenas o token próprio do monitor. Consulta `/adm/movimentoestoque` usando o coordenador compartilhado do Everest.
- A leitura exige todas as páginas e os totais declarados pela API. Erro de consulta mantém a pendência, nunca comprova ausência de operação.
- Cada acompanhamento vence após 48 horas. O vencimento gera um aviso de baixa não confirmada.
- O GHOST mostra os acompanhamentos do usuário autenticado em `/compras/avisos`, acessível pelo sino do cabeçalho.
- O e-mail é enviado pela Edge Function `compras-integracao-email`. O aceite do provedor fica em `email_sent_at` e `email_provider_id`; isso não é comprovação de entrega na caixa postal.

## Proteção contra repetição

Reserva de três minutos por execução; intervalo mínimo de dez minutos por acompanhamento. O aviso no banco usa o ID do acompanhamento como chave. O e-mail usa uma chave de idempotência estável e encerra as tentativas após vinte horas da primeira tentativa para não ultrapassar a janela de proteção do provedor. Uma falha de persistência após envio exige conferir o provedor antes de reabrir essa janela.

## Configuração e publicação

1. Aplicar a migration de modelo.
2. Configurar `COMPRAS_WATCH_CRON_SECRET` com o token gerado no Vault e `COMPRAS_EVEREST_BASE_URL`, `COMPRAS_EVEREST_USUARIO`, `COMPRAS_EVEREST_SENHA`, `COMPRAS_EVEREST_ENTIDADE` no ambiente de produção.
3. Publicar a Edge Function, que usa os segredos existentes `KPH_BACKEND_SECRET_KEY` e `RESEND_API_KEY`.
4. Publicar a aplicação e comprovar 401 sem autenticação, 204 em OPTIONS e 200 com autenticação.
5. Aplicar a migration de agendamento. Conferir `cron.job`, `cron.job_run_details`, respostas do pg_net e `checked_at`/`last_error` da tabela.

Para suspender, desativar exclusivamente o job nomeado `compras-integracao-watch`. Preservar acompanhamentos e notificações para auditoria. Nenhum cadastro de destinatário ou credencial deve ser incluído em commits públicos.
