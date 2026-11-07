import type {TwinData} from './model';

/** Run on the server before serializing anything into the client component. */
export function scopeAtlas(data:TwinData,allowedIds:readonly string[]):TwinData {
 const allowed=new Set(allowedIds);
 const houses=data.houses.filter(h=>allowed.has(h.id));
 const fullScope=data.houses.every(h=>allowed.has(h.id));
 const network=data.network;
 return {
  capturedAt:data.capturedAt,source:data.source,houses,
  activity:data.activity?{
   capturedAt:data.activity.capturedAt,source:data.activity.source,from:data.activity.from,to:data.activity.to,
   rows:data.activity.rows.filter(r=>allowed.has(r.unit_id)),
  }:undefined,
  network:network?{
   capturedAt:network.capturedAt,period:network.period,commonDays:network.commonDays,commonDates:network.commonDates,
   comparison:network.comparison.filter(h=>allowed.has(h.id)),
   suppliers:network.suppliers.flatMap(s=>{
    const destinations=s.houses.filter(h=>allowed.has(h.unit_id));
    if(!destinations.length)return [];
    const sum=(key:'kg'|'spend'|'invoices')=>destinations.reduce((n,h)=>n+h[key],0);
    // The frozen source has per-house KG, spend and invoice counts. Other
    // units only have group totals, so they must not cross a partial scope.
    return [{id:s.id,name:s.name,label:s.label,houses:destinations,
     kg:fullScope?s.kg:sum('kg'),spend:fullScope?s.spend:sum('spend'),invoices:fullScope?s.invoices:sum('invoices'),
     volumes:fullScope?s.volumes:[{unit:'KG',quantity:sum('kg')}],
    }];
   }),
  }:undefined,
 };
}
