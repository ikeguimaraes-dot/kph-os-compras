import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const U='00000000-0000-0000-0000-000000000001',A='00000000-0000-0000-0000-000000000002',I='00000000-0000-0000-0000-000000000003',J='00000000-0000-0000-0000-000000000004',B='00000000-0000-0000-0000-000000000005';
async function setup(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);
 create table units(id uuid primary key,brand_id uuid);create table roles(id uuid primary key,name text);create table user_roles(user_id uuid,role_id uuid,unit_id uuid,brand_id uuid,group_id uuid);
 create table everest_itens(id uuid primary key,unidade_medida text);create table compras_estoque_apresentacoes(unit_id uuid,insumo_id uuid);insert into units values('${U}',null);insert into auth.users values('${A}'),('${B}');insert into roles values('${A}','founder');insert into user_roles values('${A}','${A}',null,null,null);insert into everest_itens values('${I}','KG'),('${J}','UN');
 create type purchase_order_status as enum('rascunho','enviado','parcial','recebido','cancelado');
 create table suppliers(id uuid primary key,unit_id uuid,ativo boolean);
 create table purchase_orders(id uuid primary key,unit_id uuid,supplier_id uuid,fornecedor text,status purchase_order_status,data_prevista date,updated_at timestamptz);
 create table purchase_order_items(id uuid primary key,order_id uuid,nome text,unidade text,quantidade numeric,quantidade_recebida numeric,preco_unitario numeric);`);
 await db.exec('grant all on purchase_orders,purchase_order_items to authenticated;');
 for(const file of ['20261103071112_compras_fluxo_operacional.sql','20261103071503_compras_recebimento_transacional.sql','20261103072807_compras_operacao_governanca.sql'])await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 return db;
}
const call=async(db,action,data,mode='teste',key=randomUUID(),actor=A)=>(await db.query('select compras_fluxo_executar($1,$2,$3,$4,$5) result',[actor,key,mode,action,JSON.stringify(data)])).rows[0].result;
test('lot counts, FEFO reservations, dispatch, partial receipt and replay preserve quantities',async()=>{
 const db=await setup();try{
  const from=await call(db,'local',{unit_id:U,nome:'Origem teste',tipo:'qg'}),to=await call(db,'local',{unit_id:U,nome:'Destino teste',tipo:'setor'});
  const input={local_id:from.id,item_id:I,lote:'A',validade:'2098-01-01',quantidade:10,versao:0,motivo:'Contagem conferida'},key=randomUUID();
  const first=await call(db,'contagem',input,'teste',key);assert.deepEqual(await call(db,'contagem',input,'teste',key),first);
  await assert.rejects(call(db,'contagem',{...input,quantidade:11},'teste',key),/Chave/);
  await assert.rejects(call(db,'contagem',input,'real'),/Local indisponível/);
  await assert.rejects(call(db,'contagem',input,'teste',randomUUID(),B),/autorização/);
  await call(db,'contagem',{...input,lote:'B',validade:'2099-01-01',quantidade:5});
  let order=await call(db,'criar_ordem',{origem_id:from.id,destino_id:to.id,tipo:'transferencia',prevista_em:'2097-01-01',motivo:'Transferência conferida',itens:[{item_id:I,papel:'produto',quantidade:12}]});
  const transition=async action=>{order=await call(db,action,{ordem_id:order.id,versao:order.versao});};
  await assert.rejects(transition('iniciar'),/Transição/);await transition('solicitar');await transition('aprovar');
  const reserved=(await db.query('select lote,reservado from compras_fluxo_lotes order by lote')).rows;
  assert.equal(Number(reserved[0].reservado),10);assert.equal(Number(reserved[1].reservado),2);
  await assert.rejects(call(db,'contagem',{...input,quantidade:9,versao:2}),/inferior à reserva/);
  await transition('iniciar');assert.equal(order.status,'em_transito');
  assert.equal(Number((await db.query('select sum(quantidade) q from compras_fluxo_lotes')).rows[0].q),3);
  const line=(await db.query('select id from compras_fluxo_itens where ordem_id=$1',[order.id])).rows[0];
  const receive={ordem_id:order.id,versao:order.versao,linha_id:line.id,origem_lote_id:first.id,lote:'A',validade:'2098-01-01',quantidade:6,motivo:'Recebido e pesado'};
  await assert.rejects(call(db,'receber',{...receive,validade:'2099-01-01'}),/Preserve lote/);
  const receiptKey=randomUUID();order=await call(db,'receber',receive,'teste',receiptKey);assert.equal(order.status,'parcial');
  assert.deepEqual(await call(db,'receber',receive,'teste',receiptKey),order);
  assert.equal(Number((await db.query('select sum(quantidade) q from compras_fluxo_lotes')).rows[0].q),9);
  await assert.rejects(call(db,'receber',{...receive,versao:order.versao,quantidade:5}),/trânsito deste lote/);
  order=await call(db,'receber',{...receive,versao:order.versao,quantidade:4});
  const lotB=(await db.query("select id from compras_fluxo_lotes where local_id=$1 and lote='B'",[from.id])).rows[0];
  order=await call(db,'receber',{...receive,versao:order.versao,origem_lote_id:lotB.id,lote:'B',validade:'2099-01-01',quantidade:2});
  assert.equal(order.status,'concluido');assert.equal(Number((await db.query('select sum(quantidade) q from compras_fluxo_lotes')).rows[0].q),15);
  await db.exec('set role authenticated');await assert.rejects(db.query('select * from compras_fluxo_lotes'),/permission denied/);await assert.rejects(db.query(`select compras_fluxo_executar('${A}','${randomUUID()}','teste','local','{}')`),/permission denied/);
 }finally{await db.close()}
});
test('production consumes inputs once, records actual yield, and closes variance explicitly',async()=>{
 const db=await setup();try{
  const loc=await call(db,'local',{unit_id:U,nome:'Produção teste',tipo:'setor'});
  await call(db,'contagem',{local_id:loc.id,item_id:I,lote:'I',quantidade:10,versao:0,motivo:'Contagem conferida'});
  let o=await call(db,'criar_ordem',{origem_id:loc.id,destino_id:loc.id,tipo:'producao',prevista_em:'2097-01-01',motivo:'Composição conferida pelo responsável',itens:[{item_id:I,papel:'insumo',quantidade:5},{item_id:J,papel:'produto',quantidade:10}]});
  for(const action of ['solicitar','aprovar','iniciar'])o=await call(db,action,{ordem_id:o.id,versao:o.versao});
  const line=(await db.query("select id from compras_fluxo_itens where ordem_id=$1 and papel='produto'",[o.id])).rows[0];
  o=await call(db,'receber',{ordem_id:o.id,versao:o.versao,linha_id:line.id,lote:'PROD-1',quantidade:8,motivo:'Produção pesada e conferida'});
  o=await call(db,'encerrar_divergencia',{ordem_id:o.id,versao:o.versao,motivo:'Rendimento real de oito unidades, perda documentada pelo responsável'});
  assert.equal(o.status,'concluido');const lots=(await db.query('select item_id,quantidade from compras_fluxo_lotes order by item_id')).rows;
  assert.equal(Number(lots[0].quantidade),5);assert.equal(Number(lots[1].quantidade),8);
 }finally{await db.close()}
});
test('purchase approval binds content; receipt is atomic, scoped, incremental and idempotent',async()=>{
 const db=await setup();try{
  await db.exec(`insert into suppliers values('${I}','${U}',true);insert into purchase_orders values('${I}','${U}','${I}','Fornecedor','rascunho','2099-01-01',now());insert into purchase_order_items values('${J}','${I}','Item','KG',10,0,5);`);
  const transition=action=>db.query('select compras_pedido_transicao($1,$2,$3,$4)',[A,I,action,'Conferência documentada']);
  await assert.rejects(transition('registrar_envio'),/Aprovação ausente/);await transition('aprovar');
  await db.query('update purchase_order_items set preco_unitario=6 where id=$1',[J]);await assert.rejects(transition('registrar_envio'),/alterado após/);
  await transition('aprovar');await transition('registrar_envio');
  const lines=[{item_id:J,aceita:4,recusada:1,preco_nota:6,lote:'NF1',motivo:'Uma unidade recusada na inspeção'}],key=randomUUID();
  const receive=(k,ls,doc='NF '+k)=>db.query('select compras_recebimento_registrar($1,$2,$3,$4,$5,$6) result',[A,k,I,doc,'Entrega conferida',JSON.stringify(ls)]);
  const r=await receive(key,lines);assert.equal(r.rows[0].result.pedido.status,'parcial');await receive(key,lines);
  await assert.rejects(receive(randomUUID(),lines,'NF '+key),/comprovante já/);
  assert.equal(Number((await db.query('select quantidade_recebida from purchase_order_items')).rows[0].quantidade_recebida),4);
  await assert.rejects(receive(randomUUID(),[{...lines[0],aceita:7,recusada:0}]),/superior ao saldo/);
  await assert.rejects(receive(randomUUID(),[{...lines[0],aceita:1,recusada:0},{...lines[0],item_id:U}]),/Item inválido/);
  assert.equal(Number((await db.query('select quantidade_recebida from purchase_order_items')).rows[0].quantidade_recebida),4);
  const completed=await receive(randomUUID(),[{...lines[0],aceita:6,recusada:0}]);assert.equal(completed.rows[0].result.pedido.status,'recebido');
  const loc=await call(db,'local',{unit_id:U,nome:'Destino real',tipo:'casa'},'real');
  const conference=(await db.query('select id from compras_recebimento_conferencias where chave=$1',[key])).rows[0].id;
  const dest=(factor=2,actor=A)=>db.query('select compras_recebimento_destinar($1,$2,$3,$4,$5,$6,$7)',[actor,conference,J,loc.id,I,factor,'Conversão de duas unidades canônicas conferida']);
  await assert.rejects(dest(2,B),/autorização/);await dest();await dest();
  assert.equal(Number((await db.query('select quantidade from compras_fluxo_lotes where local_id=$1',[loc.id])).rows[0].quantidade),8);
  await assert.rejects(dest(3),/outro vínculo/);
  await db.exec('set role authenticated');await assert.rejects(db.query("update purchase_orders set status='recebido'"),/permission denied/);await assert.rejects(db.query('update purchase_order_items set quantidade_recebida=10'),/permission denied/);
 }finally{await db.close()}
});

test('insufficient stock rolls reservations back; blocked and stale lots cannot be dispatched',async()=>{
 const db=await setup();try{
  const from=await call(db,'local',{unit_id:U,nome:'Origem',tipo:'qg'}),to=await call(db,'local',{unit_id:U,nome:'Destino',tipo:'casa'});
  const lot=await call(db,'contagem',{local_id:from.id,item_id:I,lote:'L1',quantidade:5,versao:0,motivo:'Contagem conferida'});
  let o=await call(db,'criar_ordem',{origem_id:from.id,destino_id:to.id,tipo:'transferencia',prevista_em:'2097-01-01',motivo:'Teste de saldo',itens:[{item_id:I,papel:'produto',quantidade:6}]});
  o=await call(db,'solicitar',{ordem_id:o.id,versao:o.versao});await assert.rejects(call(db,'aprovar',{ordem_id:o.id,versao:o.versao}),/insuficiente/i);
  assert.equal(Number((await db.query('select reservado from compras_fluxo_lotes where id=$1',[lot.id])).rows[0].reservado),0);
  assert.equal((await db.query('select * from compras_fluxo_reservas')).rows.length,0);
  o=await call(db,'criar_ordem',{origem_id:from.id,destino_id:to.id,tipo:'transferencia',prevista_em:'2097-01-01',motivo:'Teste de saldo válido',itens:[{item_id:I,papel:'produto',quantidade:5}]});
  for(const acao of ['solicitar','aprovar'])o=await call(db,acao,{ordem_id:o.id,versao:o.versao});
  await db.query("update compras_fluxo_lotes set contado_em=now()-interval '9 hours' where id=$1",[lot.id]);
  await assert.rejects(call(db,'iniciar',{ordem_id:o.id,versao:o.versao}),/reserva|contagem|lote/i);
  o=await call(db,'cancelar',{ordem_id:o.id,versao:o.versao,motivo:'Cancelar por contagem antiga'});
  assert.equal(Number((await db.query('select reservado from compras_fluxo_lotes where id=$1',[lot.id])).rows[0].reservado),0);
 }finally{await db.close()}
});

test('policy changes require scope and version; automation cannot be silently enabled',async()=>{
 const db=await setup();try{
  const dados={item_id:I,versao:0,modo:'simulacao',limite_valor:100,limite_quantidade:10,embalagem:2,minimo_embalagens:1,seguranca:2,lead_dias:1,porcao_minima:0.1,evidencia:'Parâmetros conferidos'};
  const save=(data,actor=A)=>db.query('select compras_operacao_configurar($1,$2,$3,$4)',[actor,U,'politica',JSON.stringify(data)]);
  await assert.rejects(save(dados,B),/autorização/);await save(dados);
  await assert.rejects(save(dados),/alterada/);await assert.rejects(save({...dados,versao:1,modo:'autonomo'}),/check constraint/);
  await save({...dados,versao:1,limite_valor:200});
  assert.equal((await db.query('select count(*) n from compras_operacao_decisoes')).rows[0].n,2);
 }finally{await db.close()}
});
