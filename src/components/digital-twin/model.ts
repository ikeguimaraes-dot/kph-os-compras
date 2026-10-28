export type Zone = 'recebimento'|'estoque'|'frio'|'cozinha'|'bar'|'salao';
export type Layer = 'operacao'|'estoque'|'fluxo';
export type TwinItem = {
 id:string;name:string;unit:string;group:string;stock:number|null;stockValid:boolean;stockAt:string|null;
 means:{dow:number;samples:number;quantity:number|null}[];safety:number|null;
 incoming:{date:string|null;quantity:number|null;confirmed:boolean}[];sourceAt:string|null;qualityBlocked:boolean;
 references:{supplier:string|null;invoice:string;date:string;purchase_unit:string;stock_unit:string;factor:number;price:number;consistent:boolean}[];
};
export type TwinHouse={id:string;name:string;snapshotAt:string;itemCount:number;stockCount:number;items:TwinItem[];coverage:{dias_conciliados:number;dias_vendas:number;dias_eventos:number}};
export type ScaleBasis='revenue'|'itemssold'|'equal';
export type RouteMode='documentado'|'fabrica';
export type TwinSupplier={id:string;name:string;label:string;kg:number;spend:number;invoices:number;volumes:{unit:string;quantity:number}[];houses:{unit_id:string;kg:number;spend:number;invoices:number}[]};
export type TwinNetwork={capturedAt:string;period:{from:string;to:string;days:number};commonDays:number;commonDates:string[];comparison:{id:string;days:number;revenue:number;itemssold:number}[];suppliers:TwinSupplier[]};
export type TwinActivity={capturedAt:string;from:string;to:string;source:string;rows:{unit_id:string;dow:number;samples:number;mean_clients:number}[]};
export type TwinData={capturedAt:string;source:string;houses:TwinHouse[];network?:TwinNetwork;activity?:TwinActivity};
export function activityProfile(activity:TwinActivity|undefined,id:string,dow:number){
 const row=activity?.rows.find(r=>r.unit_id===id&&r.dow===dow);
 const valid=Boolean(row&&row.samples>=4&&Number.isFinite(row.mean_clients)&&row.mean_clients>=0);
 const reliable=activity?.rows.filter(r=>r.unit_id===id&&r.samples>=4&&Number.isFinite(r.mean_clients)&&r.mean_clients>=0)??[];
 const max=Math.max(0,...reliable.map(r=>r.mean_clients));
 const relative=valid&&max>0?row!.mean_clients/max:null;
 // Sixteen symbolic diners, not actual seating capacity or a live occupancy estimate.
 const symbols=!valid?8:row!.mean_clients===0?0:Math.round(4+12*(relative??0));
 return {mean:valid?row!.mean_clients:null,samples:row?.samples??0,relative,symbols,valid};
}
export function houseShare(network:TwinNetwork|undefined,id:string,basis:ScaleBasis){
 if(!network)return null;
 if(basis==='equal')return network.comparison.length?1/network.comparison.length:null;
 const total=network.comparison.reduce((s,h)=>s+Math.max(0,h[basis]),0);
 const house=network.comparison.find(h=>h.id===id);
 return house&&total>0?Math.max(0,house[basis])/total:null;
}
// The floor AREA, not each linear dimension, is proportional to the chosen metric.
export function houseScale(network:TwinNetwork|undefined,id:string,basis:ScaleBasis){
 if(!network||basis==='equal')return .65;
 const max=Math.max(0,...network.comparison.map(h=>h[basis]));
 const value=network.comparison.find(h=>h.id===id)?.[basis];
 return value==null||max<=0?.65:.8*Math.sqrt(Math.max(0,value)/max);
}
export const zones:{id:Zone;name:string;subtitle:string;color:string;x:number;z:number}[]=[
 {id:'recebimento',name:'Recebimento',subtitle:'A entrada de tudo',color:'#c3a477',x:-5,z:2.3},
 {id:'estoque',name:'Estoque seco',subtitle:'Reserva para a operação',color:'#c7ae7e',x:-5,z:-2.3},
 {id:'frio',name:'Câmaras frias',subtitle:'Preservar para servir',color:'#91bec6',x:-1.3,z:-2.3},
 {id:'cozinha',name:'Cozinha',subtitle:'Do insumo ao prato',color:'#e59b72',x:2.7,z:-2.3},
 {id:'bar',name:'Bar',subtitle:'Bebidas e preparação',color:'#a7b69c',x:5.3,z:2.3},
 {id:'salao',name:'Salão',subtitle:'Onde tudo se encontra',color:'#ccbca9',x:-.2,z:2.3},
];
export const houseColors=['#cd896b','#9ea97f','#a9a4c4','#8eafaf'];
export const num=(v:number|null|undefined,digits=1)=>v==null?'—':new Intl.NumberFormat('pt-BR',{maximumFractionDigits:digits}).format(v);
export const stamp=(s:string|null)=>s?new Date(s).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Sem leitura';
// Placement is a visual categorization, never an ERP warehouse assignment.
export function visualZone(item:TwinItem):Zone {
 if(/CAFE|CERVEJA|GIN |VODKA|VINHO|AGUA |REFRIGERANTE|SUCO/.test(item.name))return 'bar';
 if(item.group==='PRODUCAO')return 'cozinha';
 if(/CARNE|BOVIN|SUIN|FRANGO|QUEIJO|OSTRA|PEIXE|CAMARAO|SALMAO|LEITE|MANTEIGA/.test(item.name))return 'frio';
 return 'estoque';
}
export function stockUsable(item:TwinItem,at:string){
 const age=item.stockAt?Date.parse(at)-Date.parse(item.stockAt):Infinity;
 return item.stockValid&&item.stock!==null&&item.stock>=0&&age>=0&&age<=8*3600000;
}
export function projectedConsumption(item:TwinItem,at:string,days:number):number|null {
 let total=0;
 const local=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
 for(let i=0;i<days;i++){
  const date=new Date(local+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+i);
  const mean=item.means.find(m=>m.dow===(date.getUTCDay()||7));
  if(!mean||mean.quantity===null||mean.samples<4)return null;
  total+=mean.quantity;
 }
 return total;
}
