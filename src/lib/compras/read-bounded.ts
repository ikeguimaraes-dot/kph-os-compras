/** Paginate below the API's row ceiling; expose any application cap explicitly. */
export async function readBounded<T>(fetchPage:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:unknown}>,max:number){
 const data:T[]=[];
 for(let from=0;from<=max;from+=500){
  const size=Math.min(500,max+1-from),r=await fetchPage(from,from+size-1);
  if(r.error)throw Error('Consulta paginada incompleta. Atualize antes de continuar.');
  data.push(...(r.data??[]));
  if((r.data?.length??0)<size)break;
 }
 return {data,error:null,limited:data.length>max};
}
