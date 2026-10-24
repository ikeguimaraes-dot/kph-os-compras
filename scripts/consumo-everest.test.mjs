import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
test('consumption respects scope, coverage, canceled documents, movements and units',async()=>{
 const db=new PGlite()
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table units(id uuid primary key,name text,active boolean,lorean_code text);
 create table everest_itens(everest_codigo integer,unidade_medida text,subgrupo text);
 create table everest_estoque_movimentos(unit_id uuid,empresa integer,periodo_inicio date,periodo_fim date,concluido_em timestamptz,registros jsonb);
 insert into units values ('11111111-1111-4111-8111-111111111111','A',true,'1'),('22222222-2222-4222-8222-222222222222','B',true,'2');
 insert into everest_itens values(1,'KG','MPA. BOVINOS');
 insert into everest_estoque_movimentos select '11111111-1111-4111-8111-111111111111',1,(now() at time zone 'America/Sao_Paulo')::date-84+7*n,(now() at time zone 'America/Sao_Paulo')::date-78+7*n,now(),'[]'::jsonb from generate_series(0,11) n;`)
 await db.exec(await readFile('supabase/migrations/20261024044547_compras_consumo_everest.sql','utf8'))
 await db.exec(await readFile('supabase/migrations/20261024050423_compras_consumo_catalogo.sql','utf8'))
 const date=(await db.query("select ((now() at time zone 'America/Sao_Paulo')::date-1)::text as d")).rows[0].d
 const item={id_item:1,ds_item:'Ingredient',sg_unidademedida:'KG',qt_convertido:8,at_movimentacao:143}
 const doc={dt_movimento:date,at_situacao:1,ds_movimentoestoquetipo_origem:'VENDA DO DIA (INTEGRACAO PDV)',itens:[item]}
 const docs=[doc,{...doc,at_situacao:3},{...doc,ds_movimentoestoquetipo_origem:'TRANSFERENCIA'}]
 await db.query("update everest_estoque_movimentos set registros=$1::jsonb where periodo_fim=$2::date",[JSON.stringify(docs),date])
 const read=async()=> (await db.query("select compras_consumo_everest(array['11111111-1111-4111-8111-111111111111'::uuid]) as data")).rows[0].data
 let r=await read();assert.equal(r.units.length,1);assert.equal(r.units[0].d12,84);assert.equal(r.items[0].w8,1);assert.equal(r.items[0].q12,8);assert.equal(r.items[0].subgrupo,'MPA. BOVINOS');assert.equal(r.units[0].ultimo_pdv,date)
 await db.exec('delete from everest_estoque_movimentos where periodo_inicio=(select min(periodo_inicio) from everest_estoque_movimentos)')
 r=await read();assert.equal(r.items[0].w12,null);assert.equal(r.items[0].w8,1)
 await db.exec("update everest_itens set unidade_medida='UN'")
 r=await read();assert.equal(r.items[0].w8,null);assert.equal(r.items[0].pendencias,1)
 const denied=await db.query("select has_function_privilege('anon','compras_consumo_everest(uuid[])','execute') as allowed");assert.equal(denied.rows[0].allowed,false)
 await db.close()
})
