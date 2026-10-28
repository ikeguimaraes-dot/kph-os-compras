import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('referências de notas preservam casa, código, conversão e divergência histórica',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create table everest_notas_recebidas_atuais(id int,unit_id int,fornecedor_id int,everest_cd_fornecedor int,nr_nota text,dt_lancamento date,everest_cd_empresa int,everest_id_danferecebida int);
 create table everest_notas_recebidas_itens(id int,nota_id int,item_id int,everest_id_danferecebidaitem int,vl_total numeric,entra_cmv_cfop boolean);
 create table everest_raw_danferecebidaitem(everest_id_danferecebida int,everest_id_danferecebidaitem int,payload jsonb,synced_at timestamptz);
 create table everest_itens(id int,cd_item text,everest_codigo int,unidade_medida text);
 create table everest_fornecedores(id int,unit_id int,nome_fantasia text,razao_social text);
 insert into everest_itens values(1,'100',10,'KG');
 insert into everest_fornecedores values(1,1,'Fornecedor da casa 1',null);
 insert into everest_notas_recebidas_atuais values(1,1,1,20,'NF1','2026-10-01',1,101),(2,1,1,20,'NF2','2026-10-02',1,102),(3,2,1,20,'NF3','2026-10-03',2,103);
 insert into everest_notas_recebidas_itens values(1,1,1,11,20,true),(2,2,1,12,30,true),(3,3,1,13,30,true);
 insert into everest_raw_danferecebidaitem select 100+n,10+n,jsonb_build_object('cd_item','100','id_item',10,'sg_unidademedida','CX','sg_unidadedemedidapadrao','KG','id_embalagem','9','ds_embalagem','CAIXA','qt_embalagem',2,'qt_convertido',case when n=1 then 4 else 6 end),now() from generate_series(1,3)n;
 `);
 await db.exec(readFileSync(new URL('../supabase/migrations/20261028035347_automacao_referencias_notas.sql',import.meta.url),'utf8'));
 const {rows}=await db.query<{unit_id:number;fator_conversao:string;conversao_consistente:boolean;fornecedor:string|null;nr_nota:string}>('select * from compras_automacao_referencia_comercial order by unit_id');
 assert.equal(rows.length,2);
 assert.ok(rows[0]); assert.ok(rows[1]);
 assert.equal(rows[0].nr_nota,'NF2');
 assert.equal(Number(rows[0].fator_conversao),3);
 assert.equal(rows[0].conversao_consistente,false);
 assert.equal(rows[1].fornecedor,null,'não herda fornecedor de outra casa');
 await db.exec(`update everest_raw_danferecebidaitem set payload=jsonb_set(payload,'{cd_item}','"999"') where everest_id_danferecebida=103;`);
 assert.equal((await db.query('select * from compras_automacao_referencia_comercial where unit_id=2')).rows.length,0,'código divergente não se vincula');
 await db.exec(`update everest_raw_danferecebidaitem set payload=jsonb_set(payload,'{sg_unidadedemedidapadrao}','"UN"') where everest_id_danferecebida=102;`);
 assert.equal((await db.query<{conversao_valida:boolean}>('select conversao_valida from compras_automacao_referencia_nota where nota_id=2')).rows[0]?.conversao_valida,false);
 } finally {await db.close();}
});
