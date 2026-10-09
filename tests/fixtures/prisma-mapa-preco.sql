-- Read-only fixtures. The runner inserts the actual calculation from the migration.
WITH
v_ficha_explodida(unit_id,ficha_id,insumo_id,quantidade) AS (VALUES
 ('u','complete','a',2::numeric),('u','complete','b',1),
 ('u','partial','a',1),('u','partial','missing',1),
 ('u','no-supplier','c',1),('u','invalid-quantity','a',NULL)),
v_preco_medio_compra(unit_id,item_id,preco_medio) AS (VALUES
 ('u','a',10::numeric),('u','b',0::numeric)),
history_values(unit_id,item_id,year_offset,mes,vl_custo_medio,id) AS (VALUES
 ('u','a',-1,1,99::numeric,1),
 ('u','b',-2,1,2,2),('u','b',-1,1,4,3),('u','b',-1,2,0,4),
 ('u','b',1,1,999,5),('other','b',-1,1,999,6),
 ('other','missing',-1,1,999,7),('u','c',-1,1,5,8)),
everest_itens_custo_historico AS (
 SELECT unit_id,item_id,extract(year FROM CURRENT_DATE)::int+year_offset AS ano,
   mes,vl_custo_medio,id,NULL::timestamptz AS snapshot_em,NULL::timestamptz AS atualizado_em
 FROM history_values
),
produto_venda_ficha(unit_id,ficha_id,id,nome_venda_original,receita_12m,status) AS (VALUES
 ('u','complete','complete','Complete dish',300::numeric,'confirmado'),
 ('u','partial','partial','Partial dish',100,'confirmado'),
 ('u','no-supplier','no-supplier','No supplier dish',100,'confirmado'),
 ('u','invalid-quantity','invalid-quantity','Invalid quantity dish',100,'confirmado'),
 ('u','complete','unconfirmed','Unconfirmed dish',100,'pendente')),
v_mapa_share(unit_id,item_id,raiz_cnpj,share_12m) AS (VALUES
 ('u','a','supplier-1',0.25::numeric),('u','a','supplier-2',0.75),('u','b','supplier-1',1)),
v_mapa_insumo AS (
 SELECT 'u'::text AS unit_id,'none'::text AS insumo_id,NULL::text AS nome,NULL::text AS categoria,
 0::bigint AS reserva,NULL::date AS ultima_compra,NULL::text AS principal_90d,NULL::text AS principal_12m,
 false AS fornecedor_trocou WHERE false
),
everest_itens(id,descricao,grupo) AS (VALUES ('a','Ingredient A','Group'),('b','Ingredient B','Group'),('missing','Missing price','Group'),('c','Historical only','Group')),
mapa AS (
/* CALCULATION */
), checks AS (
 SELECT 'purchase precedes history' AS name, count(*)=2 AND bool_and(preco_unitario=10 AND fonte_preco='compra') AS pass FROM mapa WHERE produto_venda_ficha_id='complete' AND insumo_id='a'
 UNION ALL SELECT 'latest positive, same house, no future, zero purchase fallback', count(*)=1 AND bool_and(preco_unitario=4 AND fonte_preco='historico') FROM mapa WHERE produto_venda_ficha_id='complete' AND insumo_id='b'
 UNION ALL SELECT 'shares conserve full recipe revenue', abs(sum(receita_atribuida)-300)<0.00001 AND count(*)=3 FROM mapa WHERE produto_venda_ficha_id='complete'
 UNION ALL SELECT 'missing price retains ingredient without supplier', count(*)=1 AND bool_and(peso_custo IS NULL AND receita_atribuida IS NULL AND raiz_cnpj IS NULL AND fonte_preco='sem_preco' AND insumo='Missing price') FROM mapa WHERE produto_venda_ficha_id='partial' AND insumo_id='missing'
 UNION ALL SELECT 'partial denominator never redistributes full revenue', count(*)=3 AND bool_and(peso_custo IS NULL AND receita_atribuida IS NULL AND NOT custo_completo) FROM mapa WHERE produto_venda_ficha_id='partial'
 UNION ALL SELECT 'known historical cost survives missing supplier', count(*)=1 AND bool_and(peso_custo=1 AND preco_unitario=5 AND receita_atribuida IS NULL AND share_fornecedor IS NULL) FROM mapa WHERE produto_venda_ficha_id='no-supplier'
 UNION ALL SELECT 'unknown quantity invalidates denominator', count(*)=2 AND bool_and(peso_custo IS NULL AND NOT custo_completo) FROM mapa WHERE produto_venda_ficha_id='invalid-quantity'
 UNION ALL SELECT 'unconfirmed bridge excluded', count(*)=0 FROM mapa WHERE produto_venda_ficha_id='unconfirmed'
)
SELECT name,pass FROM checks ORDER BY name;
