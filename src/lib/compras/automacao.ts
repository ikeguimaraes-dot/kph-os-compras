/** Cálculo puro: todas as quantidades na unidade canônica do insumo. */
export type DailyDemand = { date: string; quantity: number | null; samples: number };
export type Incoming = { date: string; quantity: number; confirmed: boolean };
export type AutomationInput = {
  demand: DailyDemand[];
  stock: { quantity: number; observedAt: string; validated: boolean } | null;
  incoming: Incoming[]; incomingComplete: boolean;
  pack: number | null; minimumPacks: number; safety: number | null;
  leadDays: number | null; portion: number | null;
  qualityBlocked: boolean; now: string;
};
export type AutomationResult = {
  demand: number | null; incoming: number; stock: number | null;
  quantity: number | null; packs: number | null;
  state: '85' | '86' | 'disponivel' | 'nao_comprovado';
  exceptions: string[]; firstShortage: string | null;
};
const finite = (v: number | null): v is number => v !== null && Number.isFinite(v);
const nonnegative = (v: number | null): v is number => finite(v) && v >= 0;
export function calculateOrder(input: AutomationInput): AutomationResult {
  const errors: string[] = [];
  const now = Date.parse(input.now);
  const demandOk = input.demand.length > 0 && input.demand.every(d => nonnegative(d.quantity) && /^\d{4}-\d{2}-\d{2}$/.test(d.date))
    && new Set(input.demand.map(d => d.date)).size === input.demand.length;
  if (!demandOk || input.demand.some(d=>d.samples<4)) errors.push('demanda_sem_amostra_suficiente');
  const demand = demandOk ? input.demand.reduce((s,d)=>s+d.quantity!,0) : null;
  const stock = input.stock;
  const stockOk = !!stock && stock.validated && nonnegative(stock.quantity) && Number.isFinite(now)
    && Number.isFinite(Date.parse(stock.observedAt)) && now-Date.parse(stock.observedAt)>=0 && now-Date.parse(stock.observedAt)<=8*3600000;
  if (!stockOk) errors.push('estoque_sem_posicao_utilizavel');
  if (!input.incomingComplete) errors.push('pedidos_abertos_sem_conciliacao');
  const packOk = finite(input.pack) && input.pack>0 && Number.isInteger(input.minimumPacks) && input.minimumPacks>=0;
  if (!packOk) errors.push('embalagem_ou_minimo_pendente');
  if (!nonnegative(input.safety)) errors.push('seguranca_pendente');
  if (!Number.isInteger(input.leadDays) || input.leadDays===null || input.leadDays<0) errors.push('prazo_pendente');
  const dates = input.demand.map(d=>d.date).sort();
  const end = dates.at(-1) ?? '';
  const start = dates[0] ?? '';
  const incomingOk = input.incoming.every(r=>nonnegative(r.quantity) && /^\d{4}-\d{2}-\d{2}$/.test(r.date));
  if (!incomingOk) errors.push('entrega_invalida');
  const arrivals = input.incoming.filter(r=>r.confirmed && nonnegative(r.quantity) && r.date>=start && r.date<=end);
  const incoming = arrivals.reduce((s,r)=>s+r.quantity,0);
  if (input.incoming.some(r=>!r.confirmed || r.date<start)) errors.push('entrega_sem_confirmacao_ou_atrasada');
  let firstShortage: string | null = null;
  let state: AutomationResult['state'] = 'nao_comprovado';
  if (input.qualityBlocked) state='86';
  else if (stockOk && finite(input.portion) && input.portion>0 && stock!.quantity<input.portion) state='86';
  if (stockOk && demandOk && input.demand.every(d=>d.samples>=4) && input.incomingComplete && incomingOk && input.leadDays!==null && input.leadDays>=0) {
    let balance=stock!.quantity;
    for (const day of [...input.demand].sort((a,b)=>a.date.localeCompare(b.date))) {
      balance+=arrivals.filter(r=>r.date===day.date).reduce((s,r)=>s+r.quantity,0);
      balance-=day.quantity!;
      if (balance<0 && firstShortage===null) firstShortage=day.date;
    }
    const beforeDelivery=input.demand.slice().sort((a,b)=>a.date.localeCompare(b.date)).slice(0,input.leadDays+1);
    const demandToDelivery=beforeDelivery.reduce((s,d)=>s+d.quantity!,0);
    // 85 exige cobertura insuficiente até reposição. Embalagem não altera disponibilidade.
    if (state!=='86' && input.safety!==null && nonnegative(input.safety) && !input.incoming.some(r=>!r.confirmed||r.date<start)) {
      const cutoff=beforeDelivery.at(-1)?.date??start;
      const timely=arrivals.filter(r=>r.date<=cutoff).reduce((s,r)=>s+r.quantity,0);
      state=(firstShortage!==null&&firstShortage<=cutoff)||stock!.quantity+timely<demandToDelivery+input.safety?'85':'disponivel';
    }
  }
  const ready=errors.length===0 && !input.qualityBlocked;
  const net=ready?Math.max(0,demand!+input.safety!-stock!.quantity-incoming):null;
  const packs=net===null?null:net===0?0:Math.max(input.minimumPacks,Math.ceil(net/input.pack!));
  return {demand,incoming,stock:stockOk?stock!.quantity:null,quantity:packs===null?null:packs*input.pack!,packs,state,exceptions:errors,firstShortage};
}
