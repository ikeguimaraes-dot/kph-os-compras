'use server';
import {readBounded} from './read-bounded';
import {comprasAccess} from './everest-access';
import {getGovernanca} from './governanca-actions';
export type Exception={unit_id:string;chave:string;titulo:string;detalhe:string;prioridade:'alta'|'normal';href:string};
export async function getExcecoes(){
 const {db,unitIds}=await comprasAccess();
 const [governance,orders,locals,receipts,snapshots]=await Promise.all([
  getGovernanca(),
  readBounded((from,to)=>db.from('purchase_orders').select('id,unit_id,numero,data_prevista').in('unit_id',unitIds).in('status',['enviado','parcial']).range(from,to),1000),
  readBounded((from,to)=>db.from('compras_fluxo_locais').select('id,unit_id,nome').in('unit_id',unitIds).eq('modo','real').range(from,to),1000),
  readBounded((from,to)=>db.from('compras_recebimento_conferencias').select('id,unit_id,order_id,documento,entrada,criado_em').in('unit_id',unitIds).order('criado_em',{ascending:false}).range(from,to),1000),
  Promise.all(unitIds.map(async id=>{const r=await db.from('compras_automacao_execucao').select('criado_em').eq('unit_id',id).order('criado_em',{ascending:false}).limit(1).maybeSingle();return {unit_id:id,...r};})),
 ]);
 if(orders.error||locals.error||receipts.error||snapshots.some(r=>r.error))throw Error('Consulta de exceções incompleta.');
 const ids=locals.data.map(l=>l.id),receiptIds=receipts.data.map(r=>r.id);
 const [lots,flows,destinations]=await Promise.all([
  ids.length?readBounded((from,to)=>db.from('compras_fluxo_lotes').select('id,local_id,lote,validade,contado_em,bloqueado,quantidade,item:everest_itens(descricao)').in('local_id',ids).gt('quantidade',0).range(from,to),5000):Promise.resolve({data:[],error:null}),
  ids.length?readBounded((from,to)=>db.from('compras_fluxo_ordens').select('id,origem_id,prevista_em,tipo,status').in('origem_id',ids).in('destino_id',ids).eq('modo','real').not('status','in','(concluido,cancelado)').range(from,to),1000):Promise.resolve({data:[],error:null}),
  receiptIds.length?readBounded((from,to)=>db.from('compras_recebimento_destinos').select('conferencia_id,pedido_item_id').in('conferencia_id',receiptIds).range(from,to),10000):Promise.resolve({data:[],error:null}),
 ]);
 if(lots.error||flows.error||destinations.error)throw Error('Consulta de estoque ou entregas incompleta.');
 const now=Date.now(),today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),items:Exception[]=[];
 for(const o of orders.data)if(!o.data_prevista||o.data_prevista<today)items.push({unit_id:o.unit_id,chave:'pedido:'+o.id,titulo:'Entrega '+(o.data_prevista?'atrasada':'sem previsão')+' · '+o.numero,detalhe:'Confirmar novo prazo e necessidade de reposição emergencial.',prioridade:'alta',href:'/compras/recebimento?pedido='+o.id});
 for(const l of lots.data??[]){const local=locals.data.find(x=>x.id===l.local_id)!;const expired=l.validade&&l.validade<today,stale=now-Date.parse(l.contado_em)>8*3600000;if(l.bloqueado||expired||stale)items.push({unit_id:local.unit_id,chave:'lote:'+l.id,titulo:expired?'Lote vencido':l.bloqueado?'Qualidade bloqueada':'Contagem antiga',detalhe:local.nome+' · lote '+l.lote,prioridade:expired||l.bloqueado?'alta':'normal',href:'/compras/logistica?modo=real'});}
 for(const o of flows.data??[])if(o.prevista_em<today)items.push({unit_id:locals.data.find(l=>l.id===o.origem_id)!.unit_id,chave:'ordem:'+o.id,titulo:'Ordem operacional atrasada',detalhe:o.tipo+' · '+o.status+' · previsão '+o.prevista_em,prioridade:'alta',href:'/compras/logistica?modo=real'});
 for(const r of receipts.data){const accepted=(r.entrada as {itens:{item_id:string;aceita:number}[]}).itens.filter(i=>Number(i.aceita)>0);const pending=accepted.filter(i=>!destinations.data?.some(d=>d.conferencia_id===r.id&&d.pedido_item_id===i.item_id));if(pending.length)items.push({unit_id:r.unit_id,chave:'recebimento:'+r.id,titulo:'Recebimento sem destino conciliado',detalhe:r.documento+' · '+pending.length+' itens aceitos sem entrada no controle local.',prioridade:'normal',href:'/compras/recebimento?pedido='+r.order_id});}
 for(const s of snapshots)if(s.data&&now-Date.parse(s.data.criado_em)>8*3600000)items.push({unit_id:s.unit_id,chave:'consolidacao',titulo:'Planejamento com consolidação antiga',detalhe:'Recalcular a casa após conferir as fontes e as baixas.',prioridade:'alta',href:'/compras/automacao'});
 return {items:items.sort((a,b)=>a.prioridade===b.prioridade?0:a.prioridade==='alta'?-1:1),governance,limited:orders.data.length>1000||locals.data.length>1000||receipts.data.length>1000||(lots.data?.length??0)>5000||(flows.data?.length??0)>1000||(destinations.data?.length??0)>10000};
}
