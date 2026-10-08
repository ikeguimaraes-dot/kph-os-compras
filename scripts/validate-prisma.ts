import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { analyzePrisma, type Line } from "../src/lib/compras/prisma-engine";
async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const end = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
  const d = new Date(end + "T12:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  const start = d.toISOString().slice(0, 10);
  const lines: Line[] = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await db
      .from("v_prisma_linhas")
      .select("*")
      .gte("data", start)
      .lte("data", end)
      .order("id")
      .range(offset, offset + 999);
    if (r.error) throw r.error;
    lines.push(...r.data);
    if (r.data.length < 1000) break;
  }
  const a = analyzePrisma(lines, [], start, end);
  const r = await db
    .from("v_prisma_fornecedor")
    .select("*")
    .order("gasto", { ascending: false });
  if (r.error) throw r.error;
  assert.equal(
    Math.round(a.total * 100),
    Math.round(r.data.reduce((n, s) => n + Number(s.gasto), 0) * 100),
  );
  for (const s of a.suppliers) {
    const v = r.data.find((v) => v.raiz_cnpj === s.root);
    assert.ok(v);
    assert.ok(
      Math.abs(s.overpaid - Number(v.pago_acima)) < 0.011,
      s.name + " overpaid",
    );
    if (s.inflation !== null && v.inflacao !== null)
      assert.ok(
        Math.abs(s.inflation - Number(v.inflacao)) < 1e-8,
        s.name + " inflation",
      );
  }
  const terms = await db
    .from("everest_titulos_fornecedor")
    .select(
      "id,vl_titulo,dt_documento,dt_vencimento,everest_fornecedores!fornecedor_id(id,cpf_cnpj)",
    )
    .limit(1);
  if (terms.error) throw terms.error;
  console.log(
    JSON.stringify(
      {
        start,
        end,
        total: a.total,
        overpaid: a.overpaid,
        count: a.suppliers.length,
        pareto: a.suppliers
          .filter((s) => s.highImpact)
          .map((s) => ({ root: s.root, name: s.name, spend: s.spend })),
        orderShare: a.orderShare,
        lines: lines.length,
        viewReconciliation: "passed",
        titlesRelation: "passed",
      },
      null,
      2,
    ),
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
