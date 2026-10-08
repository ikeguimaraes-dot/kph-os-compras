CREATE VIEW public.v_ponte_cobertura WITH (security_invoker=true) AS
SELECT unit_id,sum(receita_12m) receita_total,
coalesce(sum(receita_12m) FILTER(WHERE status='confirmado'),0) receita_confirmada,
coalesce(sum(receita_12m) FILTER(WHERE status IN ('confirmado','sem_ficha')),0) receita_resolvida,
count(*) FILTER(WHERE status='pendente') pendentes
FROM public.produto_venda_ficha GROUP BY unit_id;
GRANT SELECT ON public.v_ponte_cobertura TO authenticated,service_role;
CREATE TABLE public.prisma_refresh_log(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,iniciado_em timestamptz NOT NULL DEFAULT now(),concluido_em timestamptz,etapa text NOT NULL,erro text);
ALTER TABLE public.prisma_refresh_log ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.prisma_refresh_log TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.prisma_refresh_log_id_seq TO service_role;
CREATE FUNCTION public.atualizar_ponte_diaria() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u record; log_id bigint;
BEGIN
 INSERT INTO public.prisma_refresh_log(etapa) VALUES('ponte') RETURNING id INTO log_id;
 BEGIN
 FOR u IN SELECT DISTINCT e.unit_id FROM public.everest_unidades e WHERE NOT e.fora_do_escopo_cmv AND e.unit_id IS NOT NULL LOOP
 PERFORM public.sugerir_ponte(u.unit_id);
 END LOOP;
 UPDATE public.prisma_refresh_log SET concluido_em=now() WHERE id=log_id;
 EXCEPTION WHEN OTHERS THEN UPDATE public.prisma_refresh_log SET concluido_em=now(),erro=SQLERRM WHERE id=log_id;
 END;
END $$;
REVOKE ALL ON FUNCTION public.atualizar_ponte_diaria() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_ponte_diaria() TO service_role;
-- Runs after the 11:00 UTC Lorean ingestion. Cron outcomes remain auditable.
SELECT cron.schedule('prisma-ponte-diaria','15 11 * * *','SELECT public.atualizar_ponte_diaria()');
NOTIFY pgrst,'reload schema';
