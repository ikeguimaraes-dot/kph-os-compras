// Compare old and optimized SQL in isolated PostgreSQL; never connect to production.
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {unaccent} from '@electric-sql/pglite/contrib/unaccent';

const db = new PGlite({extensions:{pg_trgm,unaccent}});
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
await db.exec(`
create extension pg_trgm; create extension unaccent;
create type abastecimento_causa as enum ('qualidade_reprovada','sazonalidade','producao_planejamento','fornecedor_bloqueado_pagamento','atraso_entrega','pedido_nao_feito');
create function abastecimento_nome(n text) returns text language sql immutable as $$select upper(regexp_replace(public.unaccent(trim(n)),'[^a-zA-Z0-9]+',' ','g'))$$;
create table op_relatorio_diario(id uuid primary key,unit_id uuid,data date);
create table op_86(id uuid primary key,relatorio_id uuid,created_by uuid,produto_nome text,motivo text);
create table produto_venda_ficha(id uuid primary key,unit_id uuid,nome_venda text,receita_12m numeric,ficha_id uuid);
create table mv_prisma_compra_mes(unit_id uuid,mes date,item_id uuid,raiz_cnpj text,comprado_rs numeric,item_nome text);
create table mv_prisma_ficha_insumo(unit_id uuid,ficha_id uuid,insumo_id uuid);
create table v_abastecimento_titulos(unit_id uuid,fornecedor_raiz text,vl_saldo numeric,dias_atraso int);
create table abastecimento_86(id uuid primary key default gen_random_uuid(),op_86_id uuid unique,unit_id uuid,criado_por uuid,
 sugestao_prato_id uuid,sugestao_insumo_id uuid,sugestao_fornecedor_raiz text,sugestao_causa abastecimento_causa,sugestao_detalhe text,
 causa_confirmada_em timestamptz,retomada_pdv_em timestamptz,retomada_cozinha_em timestamptz,atualizado_em timestamptz,status text default 'aberto',produto_venda_ficha_id uuid);
create table lorean_workdays(id uuid,unit_id uuid,data date);
create table lorean_produtos_dia(workday_id_fk uuid,produto text,qtd numeric);
`);
for(let unit=1;unit<=2;unit++){
 await db.query('insert into op_relatorio_diario values ($1,$2,$3)',[id(100+unit),id(unit),'2026-10-01']);
 for(let n=0;n<8;n++){
  const dish=id(1000+unit*100+n), ingredient=id(2000+unit*100+n), recipe=id(3000+unit*100+n);
  const name=['Salmão Grelhado','Carne Assada','Frango ao Molho','Queijo Coalho','Polvo','Camarão','Chocolate','Sem Compra'][n];
  await db.query('insert into produto_venda_ficha values ($1,$2,$3,$4,$5)',[dish,id(unit),name,100+n,recipe]);
  await db.query('insert into mv_prisma_ficha_insumo values ($1,$2,$3)',[id(unit),recipe,ingredient]);
  if(n<7)await db.query('insert into mv_prisma_compra_mes values ($1,$2,$3,$4,$5,$6)',[id(unit),'2026-09-01',ingredient,'supplier'+n,100+n,name]);
  if(n%2===0)await db.query('insert into v_abastecimento_titulos values ($1,$2,$3,$4)',[id(unit),'supplier'+n,50,10]);
 }
 const names=[' salmao  grelhado ','Carne Assada','Frango ao molh','Queijo Coalho','Polvo','Camarao','Chocolate','Sem Compra','Inexistente XYZ'];
 const reasons=['fornecedor_ruptura','padrao_qualidade','sazonalidade','producao_planejamento','fornecedor_ruptura','outro','outro','outro','outro'];
 for(let n=0;n<names.length;n++)await db.query('insert into op_86 values ($1,$2,$3,$4,$5)',[id(4000+unit*100+n),id(100+unit),id(90),names[n],reasons[n]]);
}
await db.exec(`
insert into op_relatorio_diario values ('${id(199)}','${id(1)}','2026-09-22');
insert into op_86 values ('${id(4999)}','${id(199)}','${id(90)}','Polvo','outro');
insert into abastecimento_86(op_86_id,unit_id,sugestao_detalhe,causa_confirmada_em) values ('${id(4101)}','${id(1)}','human decision',now());
insert into abastecimento_86(op_86_id,unit_id,produto_venda_ficha_id,retomada_cozinha_em) values ('${id(4102)}','${id(1)}','${id(1102)}',now());
insert into abastecimento_86(op_86_id,unit_id,produto_venda_ficha_id) values ('${id(4103)}','${id(1)}','${id(1103)}');
insert into lorean_workdays values ('${id(6001)}','${id(1)}','2026-10-03'),('${id(6002)}','${id(1)}','2026-10-02');
insert into lorean_produtos_dia values ('${id(6001)}','FRANGO AO MOLHO',2),('${id(6002)}','Frango ao molho',1),('${id(6002)}','Queijo Coalho',2);
create temp table initial_state as select * from abastecimento_86;
`);
const migrations = new URL('../supabase/migrations/',import.meta.url);
const legacy=readFileSync(new URL('20261008185539_prisma_abastecimento_dia_operacional_inicial.sql',migrations),'utf8');
const filename=readdirSync(migrations).find(n=>n.endsWith('_abastecimento_normalizacao_materializada.sql'));
const optimized=readFileSync(new URL(filename,migrations),'utf8');
const snapshot=async()=> (await db.query("select to_jsonb(a)-'id'-'atualizado_em' row from abastecimento_86 a order by op_86_id")).rows;
await db.exec(legacy);
await db.exec('select sincronizar_abastecimento()');
const old=await snapshot();
await db.exec('truncate abastecimento_86; insert into abastecimento_86 select * from initial_state;');
await db.exec(optimized);
await db.exec('select sincronizar_abastecimento()');
const current=await snapshot();
assert.deepEqual(current,old,'optimized SQL changed business results');
assert.equal(current.length,18,'original operational window changed');
assert.equal(current.find(r=>r.row.op_86_id===id(4101)).row.sugestao_detalhe,'human decision');
assert.equal(current.find(r=>r.row.op_86_id===id(4102)).row.status,'retomado');
assert.equal(current.find(r=>r.row.op_86_id===id(4103)).row.status,'aberto','PDV must not clear kitchen block');
await db.exec('select sincronizar_abastecimento()');
assert.deepEqual(await snapshot(),current,'repeated sync changed stable results');
await db.close();
console.log('PASS: 18 cases, two units, accents/fuzzy match, supplier ranking, human confirmation, business date, kitchen guard and replay.');
