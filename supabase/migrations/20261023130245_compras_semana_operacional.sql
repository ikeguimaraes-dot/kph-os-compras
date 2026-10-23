-- Immutable daily readings. No supplier order or inventory mutation.
CREATE TABLE public.compras_semana_snapshot (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 week_start date NOT NULL CHECK(extract(isodow FROM week_start)=1),
 review_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
 unit_id uuid NOT NULL REFERENCES public.units(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 planning jsonb NOT NULL, open_orders jsonb NOT NULL DEFAULT '[]',
 UNIQUE(week_start,review_date,unit_id), UNIQUE(id,unit_id)
);
CREATE TABLE public.compras_semana_revisao (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 snapshot_id uuid NOT NULL, unit_id uuid NOT NULL,
 item_key text NOT NULL, inputs jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(snapshot_id,unit_id) REFERENCES public.compras_semana_snapshot(id,unit_id)
);
CREATE INDEX ON public.compras_semana_revisao(snapshot_id,item_key,created_at DESC);
ALTER TABLE public.compras_semana_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_semana_revisao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.compras_semana_snapshot,public.compras_semana_revisao FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.compras_semana_snapshot,public.compras_semana_revisao TO service_role;
CREATE POLICY semana_snapshot_service ON public.compras_semana_snapshot TO service_role USING(true) WITH CHECK(true);
CREATE POLICY semana_revisao_service ON public.compras_semana_revisao TO service_role USING(true) WITH CHECK(true);

CREATE FUNCTION public.compras_semana_capturar(p_week_start date,p_unit_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
 u record; inserted integer := 0; affected integer;
BEGIN
 IF extract(isodow FROM p_week_start)<>1 OR today<p_week_start-3 OR today>p_week_start+6 THEN
  RAISE EXCEPTION 'Semana fora da janela de revisão (sexta anterior a domingo da semana).';
 END IF;
 FOR u IN SELECT id FROM units WHERE id=ANY(p_unit_ids) AND active AND lorean_code IS NOT NULL LOOP
  IF EXISTS(SELECT 1 FROM compras_semana_snapshot WHERE week_start=p_week_start AND review_date=today AND unit_id=u.id) THEN CONTINUE; END IF;
  INSERT INTO compras_semana_snapshot(week_start,review_date,unit_id,planning,open_orders)
  SELECT p_week_start,today,u.id,compras_planejamento_vendas(ARRAY[u.id]),
   coalesce((SELECT jsonb_agg(jsonb_build_object('numero',p.numero,'status',p.status,
    'data_pedido',p.data_pedido,'data_prevista',p.data_prevista,'items',
    coalesce((SELECT jsonb_agg(jsonb_build_object('nome',i.nome,'unidade',i.unidade,
     'quantidade',i.quantidade,'quantidade_recebida',i.quantidade_recebida))
     FROM purchase_order_items i WHERE i.order_id=p.id),'[]'::jsonb)))
    FROM purchase_orders p WHERE p.unit_id=u.id AND p.status::text NOT IN ('recebido','cancelado')),'[]'::jsonb)
  ON CONFLICT(week_start,review_date,unit_id) DO NOTHING;
  GET DIAGNOSTICS affected=ROW_COUNT;
  inserted:=inserted+affected;
 END LOOP;
 RETURN inserted;
END $$;
REVOKE ALL ON FUNCTION public.compras_semana_capturar(date,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.compras_semana_capturar(date,uuid[]) TO service_role;
NOTIFY pgrst,'reload schema';
