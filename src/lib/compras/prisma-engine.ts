import { PRISMA, categoryName } from "./prisma-config";

export type Line = {
  id: string;
  unit_id: string;
  data: string;
  item_id: string | null;
  vl_total: number;
  vl_unitario: number;
  quantidade: number | null;
  raiz_cnpj: string;
  fornecedor_nome: string;
  item_nome: string;
  unidade: string | null;
  categoria: string;
  nr_pedido: string | null;
};
export type Term = { root: string; value: number; days: number };
export type Pair = {
  root: string;
  name: string;
  item: string;
  itemName: string;
  unit: string;
  category: string;
  spend: number;
  quantity: number;
  price: number;
  inflation: number | null;
  volatility: number;
  best: number;
  overpaid: number;
  comparable: boolean;
  warning: boolean;
  exclusive: boolean;
};
export type Supplier = {
  root: string;
  name: string;
  spend: number;
  category: string;
  categoryShare: number;
  exclusive: number;
  inflation: number | null;
  volatility: number | null;
  payment: number | null;
  overpaid: number;
  orderShare: number;
  score: number | null;
  scoreCoverage: number;
  risk: number;
  highImpact: boolean;
  quadrant: string;
  comparableSpend: number;
};
export type Category = {
  name: string;
  spend: number;
  suppliers: number;
  pareto: number;
  largest: number;
  inflation: number | null;
  orderShare: number;
  overpaid: number;
};
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const sum = <T>(a: T[], f: (v: T) => number) => a.reduce((n, v) => n + f(v), 0);
const weighted = <T>(
  a: T[],
  value: (v: T) => number | null,
  weight: (v: T) => number,
): number | null => {
  const valid = a.filter(
    (v) => value(v) !== null && Number.isFinite(value(v)) && weight(v) > 0,
  );
  const total = sum(valid, weight);
  return total ? sum(valid, (v) => (value(v) ?? 0) * weight(v)) / total : null;
};
const group = <T>(a: T[], key: (v: T) => string) => {
  const m = new Map<string, T[]>();
  for (const v of a) {
    const k = key(v);
    const list = m.get(k) ?? [];
    list.push(v);
    m.set(k, list);
  }
  return m;
};
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const cents = (a: Line[]) =>
  a.reduce((n, l) => n + Math.round(Number(l.vl_total) * 100), 0) / 100;
export function paretoRoots<T extends { root: string; spend: number }>(
  rows: T[],
) {
  const sorted = [...rows].sort(
    (a, b) => b.spend - a.spend || a.root.localeCompare(b.root),
  );
  const total = sum(sorted, (s) => s.spend);
  let accumulated = 0;
  const result = new Set<string>();
  for (const s of sorted) {
    if (accumulated < total * PRISMA.pareto) result.add(s.root);
    accumulated += s.spend;
  }
  return result;
}
export function analyzePrisma(
  input: Line[],
  terms: Term[],
  start: string,
  end: string,
) {
  const lines = input
    .filter((l) => l.data >= start && l.data <= end)
    .map((l) => ({
      ...l,
      vl_total: Number(l.vl_total),
      vl_unitario: Number(l.vl_unitario),
      categoria: categoryName(l.categoria),
    }));
  const firstEnd = new Date(`${start}T12:00:00Z`);
  firstEnd.setUTCDate(firstEnd.getUTCDate() + 90);
  const lastStart = new Date(`${end}T12:00:00Z`);
  lastStart.setUTCDate(lastStart.getUTCDate() - 89);
  const canInflate =
    (new Date(`${end}T12:00:00Z`).getTime() -
      new Date(`${start}T12:00:00Z`).getTime()) /
      86400000 >=
    179;
  const valid = lines.filter(
    (l) => l.item_id && l.vl_total > 0 && l.vl_unitario > 0,
  );
  const pairs: Pair[] = [];
  for (const ls of group(
    valid,
    (l) => `${l.item_id}|${l.raiz_cnpj}`,
  ).values()) {
    const one = ls[0]!;
    const spend = sum(ls, (l) => l.vl_total),
      quantity = sum(ls, (l) => l.vl_total / l.vl_unitario);
    const price = (a: Line[]) =>
      a.length
        ? sum(a, (l) => l.vl_total) / sum(a, (l) => l.vl_total / l.vl_unitario)
        : null;
    const early = price(
        ls.filter((l) => l.data < firstEnd.toISOString().slice(0, 10)),
      ),
      late = price(
        ls.filter((l) => l.data >= lastStart.toISOString().slice(0, 10)),
      );
    const avg = sum(ls, (l) => l.vl_unitario) / ls.length;
    pairs.push({
      root: one.raiz_cnpj,
      name: one.fornecedor_nome,
      item: one.item_id!,
      itemName: one.item_nome,
      unit: one.unidade ?? "—",
      category: one.categoria,
      spend,
      quantity,
      price: spend / quantity,
      inflation: canInflate && early && late ? late / early - 1 : null,
      volatility:
        Math.sqrt(sum(ls, (l) => (l.vl_unitario - avg) ** 2) / ls.length) / avg,
      best: 0,
      overpaid: 0,
      comparable: false,
      warning: false,
      exclusive: false,
    });
  }
  for (const ps of group(pairs, (p) => p.item).values()) {
    const min = Math.min(...ps.map((p) => p.price)),
      max = Math.max(...ps.map((p) => p.price)),
      ratio = max / min;
    for (const p of ps) {
      p.best = min;
      p.exclusive = ps.length === 1;
      p.comparable = ps.length > 1 && ratio <= PRISMA.priceRatioLimit;
      p.warning =
        ratio >= PRISMA.packagingWarningRatio || /ovo|barril/i.test(p.itemName);
      p.overpaid = p.comparable ? Math.max(0, (p.price - min) * p.quantity) : 0;
    }
  }
  const categoryPairs = group(pairs, (p) => p.category),
    supplierPairs = group(pairs, (p) => p.root);
  const categories: Category[] = [];
  for (const [name, ls] of group(lines, (l) => l.categoria)) {
    const ss = [...group(ls, (l) => l.raiz_cnpj)].map(([root, a]) => ({
      root,
      spend: cents(a),
    }));
    const spend = cents(ls),
      ps = categoryPairs.get(name) ?? [];
    categories.push({
      name,
      spend,
      suppliers: ss.length,
      pareto: paretoRoots(ss).size,
      largest: spend ? Math.max(0, ...ss.map((s) => s.spend)) / spend : 0,
      inflation: weighted(
        ps,
        (p) => p.inflation,
        (p) => p.spend,
      ),
      orderShare: spend
        ? cents(ls.filter((l) => hasOrder(l.nr_pedido))) / spend
        : 0,
      overpaid: money(sum(ps, (p) => p.overpaid)),
    });
  }
  categories.sort((a, b) => b.spend - a.spend);
  const supplierTerms = group(terms, (t) => t.root),
    suppliers: Supplier[] = [];
  for (const [root, ls] of group(lines, (l) => l.raiz_cnpj)) {
    const spend = cents(ls),
      ps = supplierPairs.get(root) ?? [];
    const byCat = [...group(ls, (l) => l.categoria)]
      .map(([name, a]) => ({ name, spend: cents(a) }))
      .sort((a, b) => b.spend - a.spend);
    const cat = categories.find((c) => c.name === byCat[0]!.name)!;
    const categoryShare = cat.spend ? byCat[0]!.spend / cat.spend : 0,
      exclusive = spend
        ? sum(
            ps.filter((p) => p.exclusive),
            (p) => p.spend,
          ) / spend
        : 0;
    const inflation = weighted(
        ps,
        (p) => p.inflation,
        (p) => p.spend,
      ),
      volatility = weighted(
        ps,
        (p) => p.volatility,
        (p) => p.spend,
      );
    const payment = weighted(
        supplierTerms.get(root) ?? [],
        (t) => t.days,
        (t) => t.value,
      ),
      overpaid = money(sum(ps, (p) => p.overpaid));
    const comparableSpend = sum(
      ps.filter((p) => p.comparable),
      (p) => p.spend,
    );
    const risk =
      PRISMA.riskWeights.exclusive * clamp(exclusive) +
      PRISMA.riskWeights.category *
        clamp(categoryShare / PRISMA.riskCaps.category) +
      PRISMA.riskWeights.inflation *
        clamp((inflation ?? 0) / PRISMA.riskCaps.inflation) +
      PRISMA.riskWeights.volatility *
        clamp((volatility ?? 0) / PRISMA.riskCaps.volatility);
    const scoreParts: [number | null, number][] = [
      [
        comparableSpend
          ? 1 -
            clamp(overpaid / comparableSpend / PRISMA.scoreCaps.pricePremium)
          : null,
        PRISMA.scoreWeights.price,
      ],
      [
        inflation !== null && cat.inflation !== null
          ? clamp(
              0.5 -
                (inflation - cat.inflation) /
                  (2 * PRISMA.scoreCaps.excessInflation),
            )
          : null,
        PRISMA.scoreWeights.inflation,
      ],
      [
        payment !== null && payment > 0
          ? clamp(payment / PRISMA.scoreCaps.paymentDays)
          : null,
        PRISMA.scoreWeights.payment,
      ],
      [
        volatility !== null
          ? 1 - clamp(volatility / PRISMA.scoreCaps.volatility)
          : null,
        PRISMA.scoreWeights.stability,
      ],
    ];
    const scoreCoverage = sum(scoreParts, (p) => (p[0] === null ? 0 : p[1]));
    const hasCore = scoreParts[0]![0] !== null || scoreParts[1]![0] !== null;
    suppliers.push({
      root,
      name: ls[0]!.fornecedor_nome,
      spend,
      category: cat.name,
      categoryShare,
      exclusive,
      inflation,
      volatility,
      payment,
      overpaid,
      orderShare: spend
        ? cents(ls.filter((l) => hasOrder(l.nr_pedido))) / spend
        : 0,
      score:
        hasCore && scoreCoverage
          ? Math.round(
              (sum(scoreParts, (p) => (p[0] ?? 0) * p[1]) / scoreCoverage) *
                100,
            )
          : null,
      scoreCoverage,
      risk,
      highImpact: false,
      quadrant: "",
      comparableSpend,
    });
  }
  const high = paretoRoots(suppliers);
  for (const s of suppliers) {
    s.highImpact = high.has(s.root);
    s.quadrant = s.highImpact
      ? s.risk >= PRISMA.highRisk
        ? "Estratégico"
        : "Alavancável"
      : s.risk >= PRISMA.highRisk
        ? "Gargalo"
        : "Não crítico";
  }
  suppliers.sort((a, b) => b.spend - a.spend || a.root.localeCompare(b.root));
  const total = cents(lines);
  return {
    total,
    suppliers,
    categories,
    pairs,
    pareto: high.size,
    overpaid: money(sum(pairs, (p) => p.overpaid)),
    orderShare: total
      ? cents(lines.filter((l) => hasOrder(l.nr_pedido))) / total
      : 0,
    priceCoverage: total
      ? sum(
          pairs.filter((p) => p.comparable),
          (p) => p.spend,
        ) / total
      : 0,
    inflationAvailable: canInflate,
    lines: lines.length,
  };
}
export function hasOrder(value: string | null) {
  return value !== null && value.trim() !== "" && !/^0+$/.test(value.trim());
}
export type PrismaAnalysis = ReturnType<typeof analyzePrisma>;
