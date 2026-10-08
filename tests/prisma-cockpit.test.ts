import { test } from "node:test";
import assert from "node:assert/strict";
import {
  waterfall,
  monthly,
  menuEngineering,
  concentration,
  priceIndex,
  shiftMonth,
  monthEnd,
  type DishRow,
  type PurchaseRow,
  type MonthRow,
} from "../src/lib/compras/prisma-cockpit";
const dish = (
  name: string,
  q: number,
  revenue: number,
  cost: number | null,
  extra: Partial<DishRow> = {},
): DishRow => ({
  unit_id: "casa-a",
  mes: "2026-09-01",
  nome_venda: name,
  nome: name,
  grupo: "Principal",
  qtd: q,
  qtd_disponivel: q,
  dias_disponiveis: 30,
  disponibilidade_conhecida: true,
  receita: revenue,
  custo_unitario: cost,
  ficha_id: cost === null ? null : "ficha",
  status_ponte: cost === null ? "pendente" : "confirmado",
  ...extra,
});
const buy = (
  root: string,
  spend: number,
  extra: Partial<PurchaseRow> = {},
): PurchaseRow => ({
  unit_id: "casa-a",
  mes: "2026-09-01",
  item_id: "item",
  raiz_cnpj: root,
  fornecedor_nome: root,
  item_nome: "Item",
  categoria: "Proteínas",
  comprado_rs: spend,
  valor_precificado: spend,
  quantidade: spend / 10,
  ...extra,
});
const month = (extra: Partial<MonthRow> = {}): MonthRow => ({
  unit_id: "a",
  mes: "2026-09-01",
  comprado_rs: 200,
  receita: 1000,
  receita_confirmada: 500,
  receita_coberta: 400,
  custo_teorico_rs: 100,
  cmv_real_rs: 200,
  metodo: "proxy",
  cmv_meta_pct: 25,
  economia_meta_rs: null,
  ...extra,
});
test("waterfall telescopes while mix, costs, selling prices and captures all change", () => {
  const a = [dish("A", 10, 200, 4), dish("B", 20, 100, 2)],
    b = [dish("A", 25, 625, 5), dish("B", 5, 35, 3)];
  const w = waterfall(b, a, 34, 30, 10, 660)!;
  assert.ok(w);
  assert.ok(Math.abs(w.closure) < 1e-10);
  assert.ok(Math.abs(w.bars.reduce((s, b) => s + b.value, 0) - 4) < 1e-10);
  const purchase = w.bars
    .filter((b) => ["price", "negotiation"].includes(b.key))
    .reduce((s, b) => s + b.value, 0);
  assert.ok(Math.abs(purchase - w.netPrice) < 1e-10);
  for (const key of ["mix", "price", "sale"] as const) {
    const total = w.details.reduce((s, d) => s + d[key], 0);
    assert.ok(
      Math.abs(
        total -
          (key === "price"
            ? w.netPrice
            : w.bars.find((b) => b.key === key)!.value),
      ) < 1e-10,
    );
  }
});
test("unmapped entrants do not become zero-cost food or contaminate common basket", () => {
  const w = waterfall(
    [dish("A", 10, 200, 6), dish("Novo", 200, 1000, null)],
    [dish("A", 10, 200, 5)],
    30,
    25,
    0,
    1200,
  )!;
  assert.equal(w.count, 1);
  assert.equal(w.coverage, 1 / 6);
  assert.ok(Math.abs(w.closure) < 1e-10);
});
test("missing revenue or comparable recipes do not produce a fictional attribution", () => {
  assert.equal(
    waterfall([dish("A", 0, 0, null)], [dish("B", 2, 20, 2)], 20, 20, 0, 0),
    null,
  );
  assert.equal(
    waterfall([dish("A", 2, 20, 2)], [dish("A", 2, 20, 2)], null, 20, 0, 0),
    null,
  );
});
test("real and theoretical have different documented denominators and weighted group target", () => {
  const m = monthly([
    month(),
    month({
      unit_id: "b",
      receita: 3000,
      receita_coberta: 600,
      custo_teorico_rs: 180,
      cmv_real_rs: 900,
      cmv_meta_pct: 35,
    }),
  ]);
  assert.ok(Math.abs(m.real! - 27.5) < 1e-10);
  assert.ok(Math.abs(m.theory! - 28) < 1e-10);
  assert.equal(m.target, 32.5);
  assert.equal(m.coverage, 0.25);
  assert.ok(Math.abs(m.gapRs! + 20) < 1e-10);
  assert.equal(monthly([month({ receita: 0 })]).real, null);
  assert.equal(monthly([month({ cmv_meta_pct: null })]).target, null);
});
test("menu uses quantity share and weighted unit margin, and does not classify uncosted items", () => {
  const rows = menuEngineering([
    dish("Popular", 80, 800, 9),
    dish("Margem", 20, 400, 1),
    dish("Sem ficha", 0, 0, null),
  ]);
  assert.equal(rows[0]!.kind, "Burro de carga");
  assert.equal(rows[1]!.kind, "Quebra-cabeça");
  assert.equal(rows[2]!.kind, null);
  assert.equal(rows[0]!.margin, 1);
  assert.equal(rows[0]!.marginTotal, 80);
});
test("same dish name at another house does not change engineering thresholds", () => {
  const original = menuEngineering([
    dish("A", 20, 200, 5),
    dish("B", 20, 200, 4),
  ]);
  const combined = menuEngineering([
    dish("A", 20, 200, 5),
    dish("B", 20, 200, 4),
    dish("A", 10000, 1000000, 1, { unit_id: "casa-b" }),
  ]);
  assert.equal(combined[0]!.averageMargin, original[0]!.averageMargin);
});
test("HHI unifies suppliers and includes the supplier crossing 80 percent", () => {
  const c = concentration([
    buy("A", 30),
    buy("A", 20),
    buy("B", 30),
    buy("C", 20),
  ]);
  assert.equal(c.suppliers, 3);
  assert.equal(c.pareto, 2);
  assert.equal(c.hhi, 3800);
  assert.equal(concentration([]).hhi, null);
});
test("Laspeyres has fixed quantities, explicit carry-forward and base 100", () => {
  const rows = [
    buy("A", 100, { mes: "2025-08-01" }),
    buy("A", 100, { mes: "2025-09-01" }),
    buy("A", 120, { mes: "2025-10-01", quantidade: 10 }),
  ];
  const idx = priceIndex(rows, ["2025-09-01", "2025-10-01", "2025-11-01"]);
  assert.deepEqual(
    idx.points.map((p) => p.value),
    [100, 120, 120],
  );
  assert.equal(idx.points[2]!.observed, 0);
  assert.equal(idx.inflation, 20);
  assert.equal(priceIndex([], ["2025-09-01"]).inflation, null);
});
test("month boundaries preserve leap years and December rollover", () => {
  assert.equal(shiftMonth("2026-01-01", -1), "2025-12-01");
  assert.equal(monthEnd("2024-02-01"), "2024-02-29");
});

test("price index exposes packaging-sized variations instead of presenting verified inflation", () => {
  const idx = priceIndex(
    [
      buy("A", 100, { mes: "2026-07-01", quantidade: 10 }),
      buy("A", 120, { mes: "2026-08-01", quantidade: 10 }),
      buy("A", 400, { mes: "2026-09-01", quantidade: 10 }),
    ],
    ["2026-07-01", "2026-08-01", "2026-09-01"],
  );
  assert.equal(idx.suspicious.length, 1);
  assert.equal(idx.suspicious[0]!.ratio, 4);
  assert.equal(idx.points.at(-1)!.value, 400);
});

test("basket uses the 12 months before the reference month, not before the trend begins", () => {
  const rows = [
    buy("A", 100, { mes: "2025-10-01", quantidade: 10 }),
    buy("A", 120, { mes: "2026-08-01", quantidade: 10 }),
    buy("A", 150, { mes: "2026-09-01", quantidade: 10 }),
  ];
  const months = Array.from({ length: 12 }, (_, i) =>
    shiftMonth("2026-09-01", i - 11),
  );
  const idx = priceIndex(rows, months);
  assert.equal(idx.items, 1);
  assert.equal(idx.historyMonths, 2);
  assert.equal(idx.points[0]!.value, 100);
  assert.equal(idx.inflation, 50);
});
