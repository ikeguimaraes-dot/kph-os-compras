-- Referências observadas no ERP; não são cotação vigente, prazo ou lote mínimo.
create view public.compras_automacao_referencia_nota
with (security_invoker=true) as
with linhas as (
 select n.unit_id,i.item_id,n.fornecedor_id,n.everest_cd_fornecedor,
 coalesce(f.nome_fantasia,f.razao_social) fornecedor,
 n.id nota_id,i.id nota_item_id,n.nr_nota,n.dt_lancamento,
 n.everest_cd_empresa,n.everest_id_danferecebida,
 upper(trim(r.payload->>'sg_unidademedida')) unidade_compra,
 upper(trim(r.payload->>'sg_unidadedemedidapadrao')) unidade_destino,
 upper(trim(e.unidade_medida)) unidade_catalogo,
 r.payload->>'id_embalagem' embalagem_id,r.payload->>'ds_embalagem' embalagem,
 (r.payload->>'qt_embalagem')::numeric quantidade_compra,
 (r.payload->>'qt_convertido')::numeric quantidade_base,
 i.vl_total,r.synced_at
 from everest_notas_recebidas_atuais n
 join everest_notas_recebidas_itens i on i.nota_id=n.id
 join everest_raw_danferecebidaitem r
 on r.everest_id_danferecebida=n.everest_id_danferecebida
 and r.everest_id_danferecebidaitem=i.everest_id_danferecebidaitem
 join everest_itens e on e.id=i.item_id and e.cd_item=r.payload->>'cd_item'
 and e.everest_codigo=(r.payload->>'id_item')::integer
 left join everest_fornecedores f on f.id=n.fornecedor_id and f.unit_id=n.unit_id
 where i.entra_cmv_cfop and n.dt_lancamento <= (now() at time zone 'America/Sao_Paulo')::date
), medidas as (
 select *,quantidade_base/nullif(quantidade_compra,0) fator_conversao,
 vl_total/nullif(quantidade_base,0) preco_base,
 coalesce(quantidade_base>0 and quantidade_compra>0 and
 unidade_destino=unidade_catalogo and nullif(unidade_compra,'') is not null,false) conversao_valida
 from linhas
)
select *, 'nota_recebida_everest'::text origem from medidas;
revoke all on public.compras_automacao_referencia_nota from public,anon,authenticated;
grant select on public.compras_automacao_referencia_nota to service_role;

create view public.compras_automacao_referencia_comercial
with (security_invoker=true) as
with ordenadas as (
 select *, row_number() over(partition by unit_id,item_id,everest_cd_fornecedor,embalagem_id
 order by dt_lancamento desc,everest_id_danferecebida desc,nota_item_id) ordem,
 count(*) over(partition by unit_id,item_id,everest_cd_fornecedor,embalagem_id) observacoes,
 min(fator_conversao) over(partition by unit_id,item_id,everest_cd_fornecedor,embalagem_id) fator_minimo,
 max(fator_conversao) over(partition by unit_id,item_id,everest_cd_fornecedor,embalagem_id) fator_maximo,
 min(unidade_compra) over(partition by unit_id,item_id,everest_cd_fornecedor,embalagem_id) unidade_minima,
 max(unidade_compra) over(partition by unit_id,item_id,everest_cd_fornecedor,embalagem_id) unidade_maxima,
 bool_and(conversao_valida) over(partition by unit_id,item_id,everest_cd_fornecedor,embalagem_id) todas_validas
 from compras_automacao_referencia_nota
)
select unit_id,item_id,fornecedor_id,everest_cd_fornecedor,fornecedor,nota_id,nota_item_id,nr_nota,
 dt_lancamento,unidade_compra,unidade_destino,embalagem_id,embalagem,
 fator_conversao,preco_base,observacoes,
 (todas_validas and fator_minimo=fator_maximo and unidade_minima=unidade_maxima) conversao_consistente,
 synced_at,origem
from ordenadas where ordem=1;
revoke all on public.compras_automacao_referencia_comercial from public,anon,authenticated;
grant select on public.compras_automacao_referencia_comercial to service_role;
