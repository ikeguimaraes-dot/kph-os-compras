export type Coverage = {id:string;d4:number;d8:number;d12:number};
export type Consumption = {unit_id:string;item:number;nome:string;unidade:string;subgrupo?:string|null;q4:number|null;q8:number|null;q12:number|null;w4:number|null;w8:number|null;w12:number|null;pendencias:number};
export function consolidateConsumption(units:Coverage[],items:Consumption[]):Consumption[]{
 const allowed=new Set(units.map(u=>u.id));
 const groups=new Map<string,Consumption[]>();
 for(const i of items){
  if(!allowed.has(i.unit_id))continue;
  const key=JSON.stringify([i.item,i.unidade]);
  groups.set(key,[...(groups.get(key)??[]),i]);
 }
 return [...groups.values()].map(rows=>{
  const duplicate=new Set(rows.map(i=>i.unit_id)).size!==rows.length;
  const result:Consumption={...rows[0]!,unit_id:'consolidado',pendencias:rows.reduce((s,r)=>s+r.pendencias,0)};
  for(const n of [4,8,12] as const){
   const q=('q'+n) as 'q4'|'q8'|'q12',w=('w'+n) as 'w4'|'w8'|'w12',d=('d'+n) as 'd4'|'d8'|'d12';
   result[q]=duplicate||rows.some(r=>r[q]===null)?null:rows.reduce((s,r)=>s+r[q]!,0);
   // Missing house data never becomes zero. A missing ingredient is zero only
   // after every requested house has a complete, validated source window.
   result[w]=!units.length||duplicate||units.some(u=>u[d]!==n*7)||rows.some(r=>r[w]===null||r.pendencias>0)
    ?null:rows.reduce((s,r)=>s+r[w]!,0);
  }
  return result;
 });
}
