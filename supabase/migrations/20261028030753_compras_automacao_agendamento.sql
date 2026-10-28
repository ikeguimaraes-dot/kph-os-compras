-- As fontes ERP mantêm seus próprios jobs. Este job só consolida e audita suas leituras.
select cron.schedule('compras-automacao-bases','20 */6 * * *', 'select public.compras_automacao_atualizar();');
