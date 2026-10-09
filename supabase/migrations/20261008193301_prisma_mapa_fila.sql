begin;
create view public.v_mapa_86 with (security_invoker=true) as
select a.id,a.unit_id,coalesce(a.produto_venda_ficha_id,a.sugestao_prato_id) prato_id,
 coalesce(a.inicio_confirmado_em::date,r.data) inicio,
 a.causa::text causa,a.causa_confirmada_em is not null confirmado,a.status,o.produto_nome nome
from public.abastecimento_86 a join public.op_86 o on o.id=a.op_86_id
join public.op_relatorio_diario r on r.id=o.relatorio_id
where a.status not in ('retomado','planejado');
revoke all on public.v_mapa_86 from anon,authenticated;
grant select on public.v_mapa_86 to service_role;
comment on view public.v_mapa_86 is 'Fila aberta, vínculo sugerido explicitamente não confirma causa. Um registro por abastecimento_86.id.';
commit;
