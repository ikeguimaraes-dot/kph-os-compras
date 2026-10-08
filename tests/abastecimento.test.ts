import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rankAgreements,
  availablePopularity,
  canRemoveSignature,
  type Agreement,
} from "../src/lib/compras/abastecimento-engine";
const agreement = (id: string, cost: number, dish: string): Agreement => ({
  id,
  unit_id: "u",
  fornecedor_raiz: "v",
  pratos_liberados: [dish],
  desembolso_total_rs: cost,
  data_entrega: "2026-10-09",
  entrega_confirmada: true,
  qualidade_confirmada: true,
  todos_insumos_confirmados: true,
  status: "validado",
  prazo_recebimento_dias: 2,
});
test("three proposals rank by recovered contribution and respect the cash ceiling", () => {
  const r = rankAgreements(
    [
      agreement("a", 100, "a"),
      agreement("b", 200, "b"),
      agreement("c", 50, "c"),
    ],
    [
      {
        produto_venda_ficha_id: "a",
        contribuicao_dia: 10,
        dias_disponiveis: 20,
      },
      {
        produto_venda_ficha_id: "b",
        contribuicao_dia: 40,
        dias_disponiveis: 20,
      },
      {
        produto_venda_ficha_id: "c",
        contribuicao_dia: 5,
        dias_disponiveis: 20,
      },
    ],
    new Set(["c"]),
    250,
    0.6,
    "2026-10-08",
  );
  assert.deepEqual(
    r.map((x) => x.id),
    ["b", "c", "a"],
  );
  assert.deepEqual(
    r.map((x) => x.fits),
    [true, true, false],
  );
  assert.equal(r[1]?.remaining, 0);
});
test("same dish is never recovered twice and missing cost cannot enter ranking", () => {
  const r = rankAgreements(
    [
      agreement("a", 100, "x"),
      agreement("b", 200, "x"),
      agreement("c", 10, "unknown"),
    ],
    [
      {
        produto_venda_ficha_id: "x",
        contribuicao_dia: 100,
        dias_disponiveis: 10,
      },
    ],
    new Set(),
    1000,
    0.6,
    "2026-10-08",
  );
  assert.equal(r.filter((x) => x.fits).length, 1);
  assert.equal(r.find((x) => x.id === "b")?.overlap, true);
  assert.equal(r.find((x) => x.id === "c")?.eligible, false);
});
test("seven blocked days are excluded from exposure and unknown exposure stays unknown", () => {
  assert.equal(availablePopularity(70, 14 - 7), 10);
  assert.equal(availablePopularity(70, null), null);
});
test("signature removal requires two distinct people in the two approval seats", () => {
  assert.equal(canRemoveSignature([{ user: "a", role: "founder" }]), false);
  assert.equal(
    canRemoveSignature([
      { user: "a", role: "founder" },
      { user: "a", role: "chef" },
    ]),
    false,
  );
  assert.equal(
    canRemoveSignature([
      { user: "a", role: "founder" },
      { user: "b", role: "chef" },
    ]),
    true,
  );
});
test("no budget means no recommended disbursement; quality block prevents qualification", () => {
  const r = rankAgreements(
    [{ ...agreement("a", 10, "x"), qualidade_confirmada: false }],
    [
      {
        produto_venda_ficha_id: "x",
        contribuicao_dia: 50,
        dias_disponiveis: 3,
      },
    ],
    new Set(),
    null,
    0.6,
    "2026-10-08",
  );
  assert.equal(r[0]?.fits, false);
  assert.equal(r[0]?.eligible, false);
});

import {
  menuEngineering,
  type DishRow,
} from "../src/lib/compras/prisma-cockpit";
test("menu compares sales per available day rather than penalizing seven blocked days", () => {
  const d = (
    name: string,
    qty: number,
    days: number,
    known = true,
  ): DishRow => ({
    unit_id: "u",
    mes: "2026-10-01",
    nome_venda: name,
    nome: name,
    grupo: "main",
    qtd: qty,
    receita: qty * 20,
    ficha_id: "f",
    status_ponte: "confirmado",
    custo_unitario: 5,
    dias_disponiveis: days,
    qtd_disponivel: qty,
    disponibilidade_conhecida: known,
  });
  const result = menuEngineering([
    d("blocked", 70, 7),
    d("available", 140, 14),
  ]);
  assert.equal(result[0]?.popularity, 0.5);
  assert.equal(result[1]?.popularity, 0.5);
  assert.equal(menuEngineering([d("unknown", 1, 14, false)])[0]?.kind, null);
});
