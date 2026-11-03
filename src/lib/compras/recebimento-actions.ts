'use server';
import {readBounded} from './read-bounded';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {comprasAccess} from './everest-access';
export async function getRecebimentoOperacional(){
 const {db,units,unitIds}=await comprasAccess();
 const orders=await readBounded((from,to)=>db.from('purchase_orders').select('id,unit_id,numero,fornecedor,supplier_id,status,data_prevista,valor_total').in('unit_id',unitIds).order('created_at',{ascending:false}).range(from,to),200);
 if(orders.error)throw Error('Não foi possível carregar os pedidos.');
 const ids=(orders.data??[]).slice(0,200).map(o=>o.id);
 const [items,approvals,receipts]=ids.length?await Promise.all([
  readBounded((from,to)=>db.from('purchase_order_items').select('id,order_id,nome,unidade,quantidade,quantidade_recebida,preco_unitario').in('order_id',ids).range(from,to),20000),
  db.from('compras_pedido_aprovacoes').select('id,order_id,acao,evidencia,criado_em').in('order_id',ids).order('criado_em',{ascending:false}).limit(1000),
  db.from('compras_recebimento_conferencias').select('id,order_id,documento,observacao,entrada,resultado,criado_em').in('unit_id',unitIds).in('order_id',ids).order('criado_em',{ascending:false}).limit(1000),
 ]):[{data:[],error:null},{data:[],error:null},{data:[],error:null}];
 if(items.error||approvals.error||receipts.error||(items.data?.length??0)>20000)throw Error('Detalhamento dos pedidos indisponível.');
 return {units,orders:(orders.data??[]).slice(0,200),items:items.data??[],approvals:approvals.data??[],receipts:receipts.data??[],limited:(orders.data?.length??0)>200||approvals.data?.length===1000||receipts.data?.length===1000};
}
export async function decidirPedidoOperacional(raw:unknown){
 try{
  const v=z.object({id:z.uuid(),acao:z.enum(['aprovar','registrar_envio','cancelar']),evidencia:z.string().trim().min(3).max(2000)}).parse(raw);
  const {db,user,unitIds}=await comprasAccess(undefined,'write');
  const order=await db.from('purchase_orders').select('unit_id').eq('id',v.id).in('unit_id',unitIds).maybeSingle();
  if(order.error||!order.data)throw Error('Pedido indisponível para seu acesso.');
  const r=await db.rpc('compras_pedido_transicao',{p_ator:user.id,p_id:v.id,p_acao:v.acao,p_evidencia:v.evidencia});
  if(r.error)throw Error(r.error.message);revalidatePath('/compras');revalidatePath('/compras/recebimento');return {ok:true as const};
 }catch(e){return {ok:false as const,error:e instanceof Error?e.message:'Decisão não registrada.'};}
}
export async function registrarRecebimentoOperacional(raw:unknown){
 try{
  const v=z.object({chave:z.uuid(),pedido:z.uuid(),documento:z.string().trim().min(3).max(120),observacao:z.string().max(2000),itens:z.array(z.object({item_id:z.uuid(),aceita:z.number().finite().nonnegative().max(1e8),recusada:z.number().finite().nonnegative().max(1e8),preco_nota:z.number().finite().nonnegative().max(1e8),lote:z.string().max(100),validade:z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/),motivo:z.string().max(1000)})).min(1).max(200)}).parse(raw);
  const {db,user,unitIds}=await comprasAccess(undefined,'write');
  const order=await db.from('purchase_orders').select('unit_id').eq('id',v.pedido).in('unit_id',unitIds).maybeSingle();
  if(order.error||!order.data)throw Error('Pedido indisponível para seu acesso.');
  const r=await db.rpc('compras_recebimento_registrar',{p_ator:user.id,p_chave:v.chave,p_pedido:v.pedido,p_documento:v.documento,p_observacao:v.observacao,p_itens:v.itens});
  if(r.error)throw Error(r.error.message);revalidatePath('/compras');revalidatePath('/compras/recebimento');return {ok:true as const};
 }catch(e){return {ok:false as const,error:e instanceof Error?e.message:'Recebimento não registrado.'};}
}
