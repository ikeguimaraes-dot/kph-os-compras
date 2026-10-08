import { categoryName, PRISMA } from "./prisma-config";
import type { PrismaAnalysis } from "./prisma-engine";
export type MonthRow = {
  unit_id: string;
  mes: string;
  comprado_rs: number;
  receita: number;
  receita_confirmada: number;
  receita_coberta: number;
  custo_teorico_rs: number | null;
  cmv_real_rs: number;
  metodo: string;
  cmv_meta_pct: number | null;
  economia_meta_rs: number | null;
};
export type DishRow = {
  unit_id: string;
  mes: string;
  nome_venda: string;
  nome: string;
  grupo: string;
  qtd: number;
  receita: number;
  ficha_id: string | null;
  status_ponte: string | null;
  custo_unitario: number | null;
};
export type PurchaseRow = {
  unit_id: string;
  mes: string;
  item_id: string | null;
  raiz_cnpj: string;
  fornecedor_nome: string;
  item_nome: string;
  categoria: string;
  comprado_rs: number;
  valor_precificado: number | null;
  quantidade: number | null;
};
export type Capture = {
  unit_id: string | null;
  dono: string;
  capturado_rs: number;
  capturado_em: string | null;
  status: string;
};
export type AlertRow = {
  unit_id: string;
  data: string;
  tipo: string;
  titulo: string;
  alvo: string;
  valor: number;
  referencia: number | null;
  outra_unit_id: string | null;
  detalhe: string;
};
export type CockpitInput = {
  month: string;
  comparison: "previous" | "year";
  units: { id: string; name: string }[];
  months: MonthRow[];
  dishes: DishRow[];
  purchases: PurchaseRow[];
  captures: Capture[];
  ownerTargets?: {
    unit_id: string;
    mes: string;
    dono: string;
    economia_meta_rs: number;
  }[];
  alerts: AlertRow[];
  analysis: PrismaAnalysis;
  aliases: Record<string, string>;
  anchors: {
    unit_id: string;
    mes: string;
    raiz_cnpj: string;
    receita_dependente_rs: number;
    cobertura_receita: number;
  }[];
  refresh: string | null;
  canEdit: boolean;
};
const sum = <T>(rows: T[], f: (r: T) => number) =>
  rows.reduce((s, r) => s + (Number(f(r)) || 0), 0);
export const ratio = (n: number, d: number) => (d > 0 ? n / d : null);
export function shiftMonth(month: string, n: number) {
  const d = new Date(`${month.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}
export function monthEnd(month: string) {
  const d = new Date(`${shiftMonth(month, 1)}T12:00:00Z`);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}
export function displayName(s: string) {
  return s
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|[\s/&-])\p{L}/gu, (c) => c.toLocaleUpperCase("pt-BR"))
    .replace(/\b(Da|De|Do|Das|Dos|E)\b/g, (c) => c.toLowerCase());
}
function group<T>(rows: T[], key: (r: T) => string) {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    out.set(k, [...(out.get(k) ?? []), r]);
  }
  return out;
}
export function monthly(rows: MonthRow[]) {
  const revenue = sum(rows, (r) => r.receita),
    cost = sum(rows, (r) => r.cmv_real_rs),
    covered = sum(rows, (r) => r.receita_coberta);
  const real = ratio(cost, revenue),
    theory = ratio(
      sum(rows, (r) => r.custo_teorico_rs ?? 0),
      covered,
    );
  const withRevenue = rows.filter((r) => r.receita > 0);
  const target =
    withRevenue.length && withRevenue.every((r) => r.cmv_meta_pct !== null)
      ? sum(withRevenue, (r) => r.receita * r.cmv_meta_pct!) / revenue
      : null;
  return {
    revenue,
    cost,
    covered,
    real: real === null ? null : real * 100,
    theory: theory === null ? null : theory * 100,
    gap: real === null || theory === null ? null : (real - theory) * 100,
    gapRs: real === null || theory === null ? null : (real - theory) * revenue,
    coverage: ratio(covered, revenue),
    bridgeCoverage: ratio(
      sum(rows, (r) => r.receita_confirmada),
      revenue,
    ),
    target,
    method:
      rows.length && rows.every((r) => r.metodo === "inventario")
        ? "inventario"
        : rows.some((r) => r.metodo === "inventario")
          ? "misto"
          : "proxy",
    missingRevenue: rows.filter((r) => r.receita <= 0 && r.comprado_rs > 0)
      .length,
    savingsTarget:
      rows.length && rows.every((r) => r.economia_meta_rs !== null)
        ? sum(rows, (r) => r.economia_meta_rs!)
        : null,
  };
}
export function waterfall(
  current: DishRow[],
  previous: DishRow[],
  real1: number | null,
  real0: number | null,
  captured: number,
  revenue: number,
) {
  const key = (d: DishRow) => `${d.unit_id}|${d.nome_venda}`;
  const before = new Map(previous.map((d) => [key(d), d]));
  const pairs = current.flatMap((d) => {
    const b = before.get(key(d));
    return b &&
      d.custo_unitario !== null &&
      b.custo_unitario !== null &&
      d.qtd > 0 &&
      b.qtd > 0 &&
      d.receita > 0 &&
      b.receita > 0
      ? [{ a: b, b: d }]
      : [];
  });
  if (real1 === null || real0 === null || !pairs.length) return null;
  const r0 = sum(pairs, (p) => p.a.receita),
    r10 = sum(pairs, (p) => (p.b.qtd * p.a.receita) / p.a.qtd),
    r1 = sum(pairs, (p) => p.b.receita);
  const c0 = sum(pairs, (p) => p.a.qtd * p.a.custo_unitario!),
    c10 = sum(pairs, (p) => p.b.qtd * p.a.custo_unitario!),
    c1 = sum(pairs, (p) => p.b.qtd * p.b.custo_unitario!);
  const t0 = (c0 / r0) * 100,
    tMix = (c10 / r10) * 100,
    tCost = (c1 / r10) * 100,
    t1 = (c1 / r1) * 100;
  const mix = tMix - t0,
    price = tCost - tMix,
    sale = t1 - tCost,
    residual = real1 - t1 - (real0 - t0),
    negotiation = revenue > 0 ? (-captured / revenue) * 100 : 0;
  const details = pairs.map((p) => ({
    name: displayName(p.b.nome),
    unitId: p.b.unit_id,
    mix:
      100 *
      ((p.b.qtd * p.a.custo_unitario!) / r10 -
        (p.a.qtd * p.a.custo_unitario!) / r0),
    price: (100 * p.b.qtd * (p.b.custo_unitario! - p.a.custo_unitario!)) / r10,
    sale: 100 * p.b.qtd * p.b.custo_unitario! * (1 / r1 - 1 / r10),
  }));
  const bars = [
    { key: "mix", label: "Mix", value: mix },
    {
      key: "price",
      label: "Inflação / outros preços",
      value: price - negotiation,
    },
    { key: "negotiation", label: "Negociação registrada", value: negotiation },
    { key: "sale", label: "Preço de venda", value: sale },
    {
      key: "residual",
      label: "Perda / eficiência e cobertura",
      value: residual,
    },
  ];
  return {
    start: real0,
    end: real1,
    bars,
    details,
    closure: sum(bars, (b) => b.value) - (real1 - real0),
    coverage: ratio(r1, revenue),
    count: pairs.length,
    netPrice: price,
  };
}
export function menuEngineering(rows: DishRow[]) {
  const groups = group(rows, (r) => `${r.unit_id}|${r.grupo}`);
  return rows.map((d) => {
    const peers = groups.get(`${d.unit_id}|${d.grupo}`)!;
    const q = sum(peers, (p) => Math.max(0, p.qtd));
    const costed = peers.filter((p) => p.custo_unitario !== null && p.qtd > 0);
    const price = ratio(d.receita, d.qtd),
      margin =
        price === null || d.custo_unitario === null
          ? null
          : price - d.custo_unitario;
    const avg = ratio(
      sum(costed, (p) => p.receita - p.qtd * p.custo_unitario!),
      sum(costed, (p) => p.qtd),
    );
    const popularity = ratio(d.qtd, q);
    const cutoff = 0.7 / peers.length;
    const kind =
      margin === null || avg === null || popularity === null
        ? null
        : popularity >= cutoff
          ? margin >= avg
            ? "Estrela"
            : "Burro de carga"
          : margin >= avg
            ? "Quebra-cabeça"
            : "Cão";
    return {
      ...d,
      name: displayName(d.nome),
      price,
      margin,
      marginTotal: margin === null ? null : margin * d.qtd,
      cmv:
        price && d.custo_unitario !== null
          ? (d.custo_unitario / price) * 100
          : null,
      kind,
      popularity,
      cutoff,
      averageMargin: avg,
      groupCoverage: ratio(
        sum(costed, (p) => p.receita),
        sum(peers, (p) => p.receita),
      ),
    };
  });
}
export function concentration(rows: PurchaseRow[]) {
  const roots = [...group(rows, (r) => r.raiz_cnpj)]
    .map(([root, v]) => ({
      root,
      spend: Math.max(
        0,
        sum(v, (r) => r.comprado_rs),
      ),
    }))
    .filter((r) => r.spend > 0)
    .sort((a, b) => b.spend - a.spend || a.root.localeCompare(b.root));
  const total = sum(roots, (r) => r.spend);
  let n = 0,
    acc = 0;
  for (const r of roots) {
    if (acc < total * 0.8) {
      n++;
      acc += r.spend;
    }
  }
  return {
    suppliers: roots.length,
    pareto: n,
    hhi: total ? sum(roots, (r) => (r.spend / total) ** 2) * 10000 : null,
    total,
    roots: roots.map((r) => ({ ...r, share: total ? r.spend / total : 0 })),
  };
}
export function priceIndex(rows: PurchaseRow[], months: string[]) {
  const first = months[0];
  if (!first)
    return {
      points: [],
      items: 0,
      selected: 0,
      baseCoverage: null,
      inflation: null,
    };
  const past = rows.filter(
    (r) => r.mes < first && r.mes >= shiftMonth(first, -12) && r.item_id,
  );
  const basket = [...group(past, (r) => r.item_id!)]
    .map(([item, v]) => ({
      item,
      spend: sum(v, (r) => r.comprado_rs),
      q: sum(v, (r) => r.quantidade ?? 0),
    }))
    .filter((b) => b.q > 0 && b.spend > 0)
    .sort((a, b) => b.spend - a.spend || a.item.localeCompare(b.item))
    .slice(0, 80);
  const prices = new Map<string, Map<string, number>>();
  for (const [item, v] of group(
    rows.filter((r) => r.item_id),
    (r) => r.item_id!,
  )) {
    const map = new Map<string, number>();
    for (const [m, w] of group(v, (r) => r.mes)) {
      const p = ratio(
        sum(w, (r) => r.valor_precificado ?? 0),
        sum(w, (r) => r.quantidade ?? 0),
      );
      if (p && p > 0) map.set(m, p);
    }
    prices.set(item, map);
  }
  const last = (item: string, m: string) =>
    [...(prices.get(item) ?? new Map<string, number>())]
      .filter(([d]) => d <= m && d >= shiftMonth(m, -12))
      .sort(([a], [b]) => b.localeCompare(a))[0]?.[1];
  const eligible = basket.filter((b) => last(b.item, first) !== undefined);
  const base = sum(eligible, (b) => b.q * last(b.item, first)!);
  const points = months.map((month) => {
    const complete = eligible.every((b) => last(b.item, month) !== undefined);
    const observed = base
      ? sum(
          eligible.filter((b) => prices.get(b.item)?.has(month)),
          (b) => b.q * last(b.item, first)!,
        ) / base
      : 0;
    return {
      month,
      value:
        base && complete
          ? (sum(eligible, (b) => b.q * last(b.item, month)!) / base) * 100
          : null,
      observed,
    };
  });
  return {
    points,
    items: eligible.length,
    selected: basket.length,
    baseCoverage: ratio(
      sum(eligible, (b) => b.spend),
      sum(basket, (b) => b.spend),
    ),
    inflation:
      points.at(-1)?.value === null
        ? null
        : (points.at(-1)?.value ?? 100) - 100,
  };
}
export function buildCockpit(input: CockpitInput) {
  const month = shiftMonth(input.month, 0),
    compare = shiftMonth(month, input.comparison === "year" ? -12 : -1);
  const months = Array.from({ length: 12 }, (_, i) =>
    shiftMonth(month, i - 11),
  );
  const currentRows = input.months.filter((r) => r.mes === month),
    priorRows = input.months.filter((r) => r.mes === compare);
  const current = monthly(currentRows),
    previous = monthly(priorRows);
  const cap = input.captures.filter(
    (r) => r.status === "capturada" && r.capturado_em,
  );
  const capturedMonth = sum(
    cap.filter((r) => r.capturado_em!.slice(0, 7) === month.slice(0, 7)),
    (r) => r.capturado_rs,
  );
  const yearStart = `${month.slice(0, 4)}-01-01`,
    end = monthEnd(month);
  const yearCap = cap.filter(
    (r) => r.capturado_em! >= yearStart && r.capturado_em! <= end,
  );
  const ownerTargets = (input.ownerTargets ?? []).filter(
    (r) => r.mes >= yearStart && r.mes <= month,
  );
  const ownerNames = [
    ...new Set([
      ...yearCap.map((r) => r.dono || "Sem responsável"),
      ...ownerTargets.map((r) => r.dono),
    ]),
  ];
  const dishes = input.dishes.filter((r) => r.mes === month),
    priorDishes = input.dishes.filter((r) => r.mes === compare);
  const wf = waterfall(
    dishes,
    priorDishes,
    current.real,
    previous.real,
    capturedMonth,
    current.revenue,
  );
  const priorMenu = new Map(
    menuEngineering(priorDishes).map((d) => [
      `${d.unit_id}|${d.nome_venda}`,
      d,
    ]),
  );
  const menu = menuEngineering(dishes)
    .sort(
      (a, b) =>
        b.receita - a.receita || a.nome_venda.localeCompare(b.nome_venda),
    )
    .map((d) => {
      const prior = priorMenu.get(`${d.unit_id}|${d.nome_venda}`);
      return {
        ...d,
        deltaCmv:
          prior?.cmv != null && d.cmv !== null ? d.cmv - prior.cmv : null,
        trend: months.map(
          (m) =>
            input.dishes.find(
              (x) =>
                x.unit_id === d.unit_id &&
                x.nome_venda === d.nome_venda &&
                x.mes === m,
            )?.receita ?? null,
        ),
      };
    });
  const monthPurchases = input.purchases.filter((r) => r.mes === month),
    c12 = input.purchases.filter((r) => r.mes >= months[0]! && r.mes <= month);
  const vendor = concentration(monthPurchases);
  const suppliers = vendor.roots.slice(0, 10).map((r) => {
    const info = input.analysis.suppliers.find((s) => s.root === r.root);
    return {
      ...r,
      info,
      name:
        input.aliases[r.root] ??
        displayName(
          info?.name ??
            monthPurchases.find((p) => p.raiz_cnpj === r.root)
              ?.fornecedor_nome ??
            r.root,
        ),
      dependent: sum(
        input.anchors.filter((a) => a.raiz_cnpj === r.root && a.mes === month),
        (a) => a.receita_dependente_rs,
      ),
      trend: months.map((m) =>
        sum(
          c12.filter((p) => p.raiz_cnpj === r.root && p.mes === m),
          (p) => p.comprado_rs,
        ),
      ),
    };
  });
  const categories = [
    ...group(monthPurchases, (r) => categoryName(r.categoria)),
  ]
    .map(([name, rows]) => ({
      ...concentration(rows),
      name,
      trend: months.map(
        (m) =>
          concentration(
            c12.filter(
              (r) => r.mes === m && categoryName(r.categoria) === name,
            ),
          ).pareto,
      ),
    }))
    .sort((a, b) => b.total - a.total);
  const alerts = input.alerts
    .filter((a) =>
      a.tipo === "preco"
        ? a.referencia !== null &&
          a.valor > a.referencia * (1 + PRISMA.alertPricePremium)
        : a.tipo === "nota_alta"
          ? a.referencia !== null &&
            a.valor > a.referencia * PRISMA.alertInvoiceMultiple
          : a.tipo === "sem_ficha"
            ? a.valor >= PRISMA.alertUnmappedRevenue
            : true,
    )
    .sort((a, b) => b.valor - a.valor);
  const savingsTargetRows = input.months.filter(
    (r) => r.mes >= yearStart && r.mes <= month,
  );
  const savingsTarget =
    savingsTargetRows.length &&
    savingsTargetRows.every((r) => r.economia_meta_rs !== null)
      ? sum(savingsTargetRows, (r) => r.economia_meta_rs!)
      : null;
  return {
    month,
    compare,
    months,
    current,
    previous,
    waterfall: wf,
    menu,
    suppliers,
    categories,
    alerts,
    priceIndex: priceIndex(input.purchases, months),
    capturedMonth,
    capturedYear: sum(yearCap, (r) => r.capturado_rs),
    savingsTarget,
    savingsByOwner: ownerNames.map((name) => ({
      name,
      captured: sum(
        yearCap.filter((r) => (r.dono || "Sem responsável") === name),
        (r) => r.capturado_rs,
      ),
      target: ownerTargets.some((r) => r.dono === name)
        ? sum(
            ownerTargets.filter((r) => r.dono === name),
            (r) => r.economia_meta_rs,
          )
        : null,
    })),
    capturedTrend: months.map((m) =>
      sum(
        cap.filter(
          (c) =>
            c.capturado_em! >= months[0]! && c.capturado_em! <= monthEnd(m),
        ),
        (c) => c.capturado_rs,
      ),
    ),
    undatedCaptures: input.captures.filter(
      (r) => r.status === "capturada" && !r.capturado_em,
    ).length,
    trend: months.map((m) => ({
      month: m,
      ...monthly(input.months.filter((r) => r.mes === m)),
    })),
    byUnit: input.units.map((u) => ({
      ...u,
      months: months.map((m) => ({
        month: m,
        ...monthly(
          input.months.filter((r) => r.mes === m && r.unit_id === u.id),
        ),
      })),
    })),
    inventory: input.months
      .filter((r) => months.includes(r.mes))
      .map((r) => ({ unitId: r.unit_id, month: r.mes, method: r.metodo })),
    decisions: input.analysis.suppliers
      .filter((s) => s.overpaid > 0)
      .sort((a, b) => b.overpaid - a.overpaid)
      .slice(0, 6),
    refresh: input.refresh,
    canEdit: input.canEdit,
  };
}
export type Cockpit = ReturnType<typeof buildCockpit>;
