create or replace function public.sincronizar_abastecimento() returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not pg_try_advisory_xact_lock(hashtext('sincronizar_abastecimento')) then return; end if;
 insert into public.abastecimento_86(op_86_id,unit_id,criado_por,sugestao_prato_id,sugestao_insumo_id,sugestao_fornecedor_raiz,sugestao_causa,sugestao_detalhe)
 select o.id,r.unit_id,o.created_by,b.id,c.item_id,c.raiz_cnpj,
 (case when o.motivo::text='padrao_qualidade' then 'qualidade_reprovada' when o.motivo::text='sazonalidade' then 'sazonalidade' when o.motivo::text='producao_planejamento' then 'producao_planejamento' when coalesce(v.vencido,0)>0 then 'fornecedor_bloqueado_pagamento' when o.motivo::text='fornecedor_ruptura' then 'atraso_entrega' else 'pedido_nao_feito' end)::public.abastecimento_causa,
 'Sugestão, requer confirmação. Motivo original: '||o.motivo::text||'. '||case when b.id is null then 'Prato sem correspondência.' when public.abastecimento_nome(b.nome_venda)<>public.abastecimento_nome(o.produto_nome) then 'Nome aproximado: conferir porção e identidade.' else 'Nome coincidente.' end
 from public.op_86 o join public.op_relatorio_diario r on r.id=o.relatorio_id
 left join lateral(select b.* from public.produto_venda_ficha b where b.unit_id=r.unit_id and (public.abastecimento_nome(b.nome_venda)=public.abastecimento_nome(o.produto_nome) or similarity(public.abastecimento_nome(b.nome_venda),public.abastecimento_nome(o.produto_nome))>=0.3) order by (public.abastecimento_nome(b.nome_venda)=public.abastecimento_nome(o.produto_nome)) desc,similarity(public.abastecimento_nome(b.nome_venda),public.abastecimento_nome(o.produto_nome)) desc,b.receita_12m desc limit 1)b on true
 left join lateral(select l.item_id,l.raiz_cnpj,sum(l.comprado_rs) gasto from public.mv_prisma_compra_mes l where l.unit_id=r.unit_id and l.mes>=date_trunc('month',r.data-365)::date and l.mes<=date_trunc('month',r.data)::date and l.comprado_rs>0 and
 (exists(select 1 from public.mv_prisma_ficha_insumo fi where fi.unit_id=r.unit_id and fi.ficha_id=b.ficha_id and fi.insumo_id=l.item_id) or public.abastecimento_nome(l.item_nome) like split_part(public.abastecimento_nome(o.produto_nome),' ',1)||'%')
 group by 1,2 order by bool_or(public.abastecimento_nome(l.item_nome) like split_part(public.abastecimento_nome(o.produto_nome),' ',1)||'%') desc,max(l.mes) desc,gasto desc limit 1)c on true
 left join lateral(select sum(vl_saldo) vencido from public.v_abastecimento_titulos v where v.unit_id=r.unit_id and v.fornecedor_raiz=c.raiz_cnpj and v.dias_atraso>0)v on true
 where r.data>='2026-09-24' on conflict(op_86_id) do update set sugestao_prato_id=excluded.sugestao_prato_id,sugestao_insumo_id=excluded.sugestao_insumo_id,sugestao_fornecedor_raiz=excluded.sugestao_fornecedor_raiz,sugestao_causa=excluded.sugestao_causa,sugestao_detalhe=excluded.sugestao_detalhe where abastecimento_86.causa_confirmada_em is null;
 -- Evidence is a business day, not a precise selling timestamp. It never clears the kitchen block.
 update public.abastecimento_86 a set retomada_pdv_em=x.dia::timestamp at time zone 'America/Sao_Paulo',status=case when a.retomada_cozinha_em is not null then 'retomado' else a.status end,atualizado_em=now()
 from (select a.id,min(w.data) dia from public.abastecimento_86 a join public.op_86 o on o.id=a.op_86_id join public.op_relatorio_diario r on r.id=o.relatorio_id
 join public.produto_venda_ficha b on b.id=a.produto_venda_ficha_id
 join public.lorean_workdays w on w.unit_id=a.unit_id and w.data>r.data
 join public.lorean_produtos_dia p on p.workday_id_fk=w.id and public.abastecimento_nome(p.produto)=public.abastecimento_nome(b.nome_venda) and p.qtd>0
 where a.retomada_pdv_em is null group by a.id)x where a.id=x.id;
end $$;
