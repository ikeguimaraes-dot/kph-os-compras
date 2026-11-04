-- Run only after deploying and testing the optimized function.
-- Bound this job's session, without changing global database timeouts.
DO $$
DECLARE j bigint; previous text;
 bounded text:='SET statement_timeout=''30s''; SET lock_timeout=''5s''; SELECT public.sincronizar_abastecimento();';
BEGIN
 SELECT jobid,command INTO STRICT j,previous FROM cron.job WHERE jobname='compras-abastecimento';
 IF previous NOT IN ('select public.sincronizar_abastecimento()',bounded) THEN
  RAISE EXCEPTION 'Cron command changed; review before altering';
 END IF;
 PERFORM cron.alter_job(j,command:=bounded,active:=true);
END $$;
