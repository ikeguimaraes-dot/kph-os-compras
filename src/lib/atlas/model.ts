export type AtlasCatalog={id:string;cd_item:string;everest_codigo:number;descricao:string;unidade_medida:string;grupo:string;subgrupo:string};
export type AtlasPurchase={id:string;unitId:string;date:string;month:string;invoice:string;itemId:string|null;item:string;category:string;supplierId:string;supplier:string;value:number};
export type AtlasOrder={id:string;unitId:string;number:string;status:string;date:string;eta:string|null;supplierId:string|null;supplier:string|null;value:number|null;lines:{id:string;name:string;unit:string;quantity:number;received:number;itemId:string|null}[]};
export type AtlasStock={itemId:string;name:string;code:string;unit:string;category:string;group:string;quantity:number|null;usable:boolean;reason:string|null;historicalPrice:number|null;priceDate:string|null};
export type AtlasDepot={id:string;unitId:string;company:number;code:number;name:string;at:string|null;complete:boolean;stocks:AtlasStock[]};
export type AtlasCapacity={id:string;unitId:string;depotId:string;itemId:string;name:string;unit:string;yield:number;ready:number|null;possible:number|null;limiting:string|null;issues:string[];components:{itemId:string|null;name:string;quantity:number;available:number|null}[]};
export type AtlasReplenishment={unitId:string;itemId:string;name:string;unit:string;group:string;category:string;stock:number|null;at:string|null;minimum:number|null;demand:number|null;shortage:string|null;orderBy:string|null;forecastOk:boolean;horizonEnd:string|null;quantity:number|null;state:string;issues:string[]};
export type AtlasOperations={readAt:string;year:number;start:string;end:string;units:{id:string;name:string}[];purchases:AtlasPurchase[];orders:AtlasOrder[];depots:AtlasDepot[];capacity:AtlasCapacity[];replenishment:AtlasReplenishment[];warnings:string[]};
export function orderState(order:AtlasOrder,today:string){
 if(order.status==='cancelado'||order.status==='recebido'||order.status==='rascunho')return order.status;
 if(!order.supplierId||!order.eta)return 'dados pendentes';
 return order.eta<today?'atrasado':order.status==='parcial'?'recebido parcialmente':'aguardando entrega';
}
export function orderProgress(order:AtlasOrder,today:string){
 const state=orderState(order,today);
 if(state==='recebido')return 1;
 if(state==='atrasado')return .82;
 if(state==='aguardando entrega'||state==='recebido parcialmente')return .48;
 return 0;
}
export function potentialProduction(yieldQuantity:number,components:{id:string|null;name:string;quantity:number;utilization:number|null}[],stocks:AtlasStock[],complete:boolean){
 const issues:string[]=[];const map=new Map(stocks.map(s=>[s.itemId,s]));
 if(!complete)issues.push('Coleta do depósito incompleta');
 if(!Number.isFinite(yieldQuantity)||yieldQuantity<=0)issues.push('Rendimento inválido');
 if(!components.length)issues.push('Ficha sem componentes');
 const quantities=new Map<string,{name:string;quantity:number}>();
 for(const c of components){
  if(!c.id){issues.push('Componente sem identidade');continue;}
  if(!Number.isFinite(c.quantity)||c.quantity<=0){issues.push('Quantidade de componente inválida');continue;}
  if(c.utilization!==100)issues.push('Aproveitamento requer validação');
  const previous=quantities.get(c.id);quantities.set(c.id,{name:c.name,quantity:(previous?.quantity??0)+c.quantity});
 }
 let batches=Infinity,limiting:string|null=null;
 const details=[...quantities].map(([id,c])=>{
  const stock=map.get(id);const available=stock?.usable?stock.quantity:null;
  if(available==null)issues.push(`${c.name}: ${stock?.reason??'sem saldo identificado'}`);
  else if(available/c.quantity<batches){batches=available/c.quantity;limiting=c.name;}
  return {itemId:id,name:c.name,quantity:c.quantity,available};
 });
 return {possible:issues.length||!Number.isFinite(batches)?null:batches*yieldQuantity,limiting,issues:[...new Set(issues)],components:details};
}
export function purchaseSummary(lines:AtlasPurchase[]){
 const categories=new Map<string,number>(),suppliers=new Map<string,{id:string;name:string;value:number;months:Record<string,number>}>();
 const seen=new Set<string>();let cents=0;
 for(const p of lines){if(seen.has(p.id))continue;seen.add(p.id);const value=Math.round(p.value*100);cents+=value;categories.set(p.category,(categories.get(p.category)??0)+value);
 const s=suppliers.get(p.supplierId)??{id:p.supplierId,name:p.supplier,value:0,months:{}};s.value+=value;s.months[p.month]=(s.months[p.month]??0)+value;suppliers.set(p.supplierId,s);}
 return {total:cents/100,categories:[...categories].map(([name,value])=>({name,value:value/100})).sort((a,b)=>b.value-a.value),suppliers:[...suppliers.values()].map(s=>({...s,value:s.value/100,months:Object.fromEntries(Object.entries(s.months).map(([k,v])=>[k,v/100]))})).sort((a,b)=>b.value-a.value)};
}
// Only a fully supported daily projection can promise a replenishment date.
export function replenishmentDates(input:{stock:number|null;safety:number|null;leadDays:number|null;demand:{date:string;quantity:number|null;samples:number}[];incoming:{date:string;quantity:number;confirmed:boolean}[];exceptions:string[]}){
 const invalid={shortage:null,orderBy:null,forecastOk:false,horizonEnd:null};
 const allowed=new Set(['embalagem_ou_minimo_pendente','repor_por_producao']);
 const days=[...input.demand].sort((a,b)=>a.date.localeCompare(b.date));
 if(input.exceptions.some(e=>!allowed.has(e))||input.stock===null||!Number.isFinite(input.stock)||input.stock<0||input.safety===null||!Number.isFinite(input.safety)||input.safety<0||input.leadDays===null||!Number.isInteger(input.leadDays)||input.leadDays<0||!days.length)return invalid;
 if(days.some((d,i)=>d.quantity===null||!Number.isFinite(d.quantity)||d.quantity<0||d.samples<4||!Number.isFinite(Date.parse(d.date))||(i>0&&Date.parse(d.date)-Date.parse(days[i-1]!.date)!==86400000)))return invalid;
 if(input.incoming.some(r=>!r.confirmed||!Number.isFinite(r.quantity)||r.quantity<0||!Number.isFinite(Date.parse(r.date))||r.date<days[0]!.date))return invalid;
 let balance=input.stock,shortage:string|null=null,threshold:string|null=balance<input.safety?days[0]!.date:null;
 for(const day of days){
  balance+=input.incoming.filter(r=>r.date===day.date).reduce((s,r)=>s+r.quantity,0);
  balance-=day.quantity!;
  if(balance<0&&shortage===null)shortage=day.date;
  if(balance<input.safety&&threshold===null)threshold=day.date;
 }
 const orderBy=threshold?new Date(Date.parse(threshold+'T12:00:00Z')-input.leadDays*86400000).toISOString().slice(0,10):null;
 return {shortage,orderBy,forecastOk:true,horizonEnd:days.at(-1)!.date};
}
