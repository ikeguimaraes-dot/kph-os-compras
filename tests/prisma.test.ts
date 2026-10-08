import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzePrisma,
  paretoRoots,
  hasOrder,
  type Line,
} from "../src/lib/compras/prisma-engine";
import { sessionCookies } from "../lib/kph/db/supabase/session-cookies";
const line = (
  root: string,
  total: number,
  price: number,
  patch: Partial<Line> = {},
): Line => ({
  id: crypto.randomUUID(),
  unit_id: "casa-a",
  data: "2026-02-01",
  item_id: "item",
  vl_total: total,
  vl_unitario: price,
  quantidade: total / price,
  raiz_cnpj: root,
  fornecedor_nome: root,
  item_nome: "TESTE",
  unidade: "KG",
  categoria: "A. PROTEINAS",
  nr_pedido: null,
  ...patch,
});
const run = (ls: Line[]) => analyzePrisma(ls, [], "2025-10-08", "2026-10-08");
test("Pareto inclui o fornecedor que cruza 80% e ordena empates", () =>
  assert.deepEqual(
    [
      ...paretoRoots([
        { root: "b", spend: 35 },
        { root: "a", spend: 50 },
        { root: "c", spend: 15 },
      ]),
    ],
    ["a", "b"],
  ));
test("gasto inclui preço inválido e soma em centavos", () =>
  assert.equal(
    run([line("a", 0.1, 0), line("b", 0.2, 0), line("c", 100, 10)]).total,
    100.3,
  ));
test("preço médio ponderado reúne casas antes de comparar fornecedor", () => {
  const d = run([
    line("a", 100, 10),
    line("a", 200, 20, { unit_id: "casa-b" }),
    line("b", 100, 10),
  ]);
  assert.equal(d.pairs.find((p) => p.root === "a")?.price, 15);
  assert.equal(d.overpaid, 100);
  assert.equal(d.suppliers.length, 2);
});
test("embalagem acima de 2,5 exclui teto inteiro do item", () => {
  const d = run([line("a", 100, 10), line("b", 300, 30)]);
  assert.equal(d.overpaid, 0);
  assert.equal(d.priceCoverage, 0);
  assert.ok(d.pairs.every((p) => p.warning));
});
test("limite de 2,5 é inclusivo", () =>
  assert.equal(run([line("a", 100, 10), line("b", 250, 25)]).overpaid, 150));
test("inflação compara mesmo item e fornecedor com quantidade ponderada", () => {
  const d = run([
    line("a", 100, 10, { data: "2025-10-08" }),
    line("a", 120, 12, { data: "2026-10-08" }),
  ]);
  assert.ok(Math.abs(d.suppliers[0]!.inflation! - 0.2) < 1e-10);
});
test("período curto não usa janelas sobrepostas de inflação", () => {
  const d = analyzePrisma([line("a", 100, 10)], [], "2026-01-01", "2026-03-01");
  assert.equal(d.suppliers[0]!.inflation, null);
});
test("pedido vazio ou zero não conta", () => {
  assert.equal(hasOrder("000"), false);
  assert.equal(hasOrder(" "), false);
  assert.equal(hasOrder(null), false);
  assert.equal(hasOrder("123"), true);
});
test("nota redistribui critérios disponíveis, sem inventar prazo", () => {
  const s = run([line("a", 100, 10)]).suppliers[0]!;
  assert.equal(s.payment, null);
  assert.equal(s.scoreCoverage, 0.15);
  assert.equal(s.score, null);
});
test("sessão ausente não recebe identidade e backup válido é adaptado", () => {
  assert.deepEqual(sessionCookies([], "https://proj.supabase.co"), []);
  const value =
    "base64-" +
    Buffer.from(
      JSON.stringify({
        access_token: "test",
        refresh_token: "test",
        expires_at: 9999999999,
      }),
    ).toString("base64url");
  assert.equal(
    sessionCookies(
      [{ name: "kph_auth_session_backup", value }],
      "https://proj.supabase.co",
    ).find((c) => c.name === "sb-proj-auth-token")?.value,
    value,
  );
});

test('nota reproduz preço e inflação neutra do HTML original', () => {
  const rows = [
    line('a',100,10,{data:'2025-10-08'}),line('a',100,10,{data:'2026-10-08'}),
    line('b',150,15,{data:'2025-10-08'}),line('b',150,15,{data:'2026-10-08'}),
  ];
  const data = analyzePrisma(rows,[{root:'a',days:45,value:100}], '2025-10-08','2026-10-08');
  assert.equal(data.suppliers.find(s=>s.root==='a')?.score,88);
  assert.equal(data.suppliers.find(s=>s.root==='b')?.score,37);
});
