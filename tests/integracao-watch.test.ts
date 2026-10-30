import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {selectEvidence,validatePage} from '../src/lib/integracao-watch/everest';
const movement={id_movimentoestoque:42,cd_empresa:10,dt_movimento:'2026-10-29',at_situacao:1,ds_movimentoestoquetipo_origem:'VENDA DO DIA (INTEGRACAO PDV)',itens:[{id_item:1}],observacao:'integrado'};
test('somente baixa PDV confirmada com itens gera evidência',()=>{
 assert.equal(selectEvidence([movement],10,'2026-10-29').length,1);
 for(const change of [{at_situacao:3},{itens:[]},{ds_movimentoestoquetipo_origem:'SAIDA - REFEICAO FUNCIONARIO'}])assert.deepEqual(selectEvidence([{...movement,...change}],10,'2026-10-29'),[]);
});
test('recusa outra casa/data, duplicidade e contagem de páginas alterada',()=>{
 assert.throws(()=>selectEvidence([movement],5,'2026-10-29'));
 assert.throws(()=>selectEvidence([movement],10,'2026-10-28'));
 assert.throws(()=>selectEvidence([movement,movement],10,'2026-10-29'));
 assert.throws(()=>validatePage(301,2,{total:300,pages:1}));
 assert.throws(()=>validatePage(1,0,null));
 validatePage(0,0,null);
});
test('reserva, evidência por casa, persistência e notificação sem duplicidade',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql as 'select null::uuid';
 create table auth.users(id uuid primary key);create table public.units(id uuid primary key,name text);
 create table notifications(id uuid primary key,user_id uuid,tipo text,titulo text,mensagem text,link text);
 insert into auth.users values('11111111-1111-4111-8111-111111111111');
 insert into units values('22222222-2222-4222-8222-222222222222','Casa de teste');`);
 const sql=readFileSync('supabase/migrations/20261030110639_compras_integracao_watch.sql','utf8').split('-- Token próprio')[0]!;
 await db.exec(sql);
 await db.exec(`insert into compras_integracao_watch(unit_id,empresa,dia,user_id,email) values('22222222-2222-4222-8222-222222222222',10,'2026-10-29','11111111-1111-4111-8111-111111111111','test@example.com');`);
 const claimed=await db.query<{id:string;lease_id:string}>('select * from compras_watch_claim()');const w=claimed.rows[0]!;assert.ok(w.lease_id);
 assert.equal((await db.query('select * from compras_watch_claim()')).rows.length,0);
 await assert.rejects(db.query('select compras_watch_finish($1,$2,$3::jsonb,null)',[w.id,w.lease_id,JSON.stringify([{id:42,empresa:5,dia:'2026-10-29',linhas:3}])]));
 const evidence=JSON.stringify([{id:42,empresa:10,dia:'2026-10-29',linhas:3}]);
 await db.query('select compras_watch_finish($1,$2,$3::jsonb,null)',[w.id,w.lease_id,evidence]);
 await db.query('select compras_watch_finish($1,$2,$3::jsonb,null)',[w.id,w.lease_id,evidence]);
 const n=await db.query<{n:number}>('select count(*)::int n from notifications');assert.equal(n.rows[0]!.n,1);
 const row=(await db.query<{status:string;notice_message:string}>('select status,notice_message from compras_integracao_watch')).rows[0]!;
 assert.equal(row.status,'found');assert.match(row.notice_message,/não comprova conciliação/);
 }finally{await db.close();}
});
