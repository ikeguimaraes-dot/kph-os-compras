-- Ativar somente após a rota de produção responder à autenticação do monitor.
-- O worker deixa de consultar o Everest quando todos os acompanhamentos terminam.
select cron.schedule('compras-integracao-watch', '*/15 * * * *', 'select public.compras_watch_tick();');
