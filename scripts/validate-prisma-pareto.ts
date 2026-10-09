/** Real-data gate. Run with node --env-file=.env.local --import tsx.
 * Evidence is private. Stops on first failing oracle; never publishes. */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { classifyPareto, menuEconomy, completeParetoDishes, paretoCoverage, type ParetoProduct, paretoKey, type ParetoDish, type ParetoIngredient, type ParetoSupplier } from "../src/lib/compras/prisma-pareto";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Credenciais locais de validação indisponíveis.");
  const db = createClient(url, key, { auth: { persistSession: false } });
  async function all<T>(table: string, columns: string, keys: string[]) {
    const rows: T[] = [];
    for (let offset = 0; ; offset += 1000) {
      let query = db.from(table).select(columns);
      for (const field of keys) query = query.order(field);
      const r = await query.range(offset, offset + 999);
      if (r.error) throw new Error(`${table}: ${r.error.message}`);
      rows.push(...r.data as T[]);
      if (r.data.length < 1000) return rows;
    }
  }
  const evidence: Record<string, unknown> = { at: new Date().toISOString(), project: new URL(url).hostname };
  const directory = "docs/prisma-pareto-evidencias";
  mkdirSync(directory, { recursive: true });
  function save() { writeFileSync(`${directory}/oraculos-banco.json`, JSON.stringify(evidence, null, 2) + "\n"); }
  function gate(name: string, passed: boolean, detail: unknown) {
    evidence[name] = { passed, detail }; save();
    console.log(`${name}: ${passed ? "PASSOU" : "FALHOU — PARAR"}`);
    if (!passed) throw new Error(`${name} falhou; não executar os próximos oráculos, merge ou deploy.`);
  }
  const [confirmedDishes, suppliers, ingredients, edges, purchases, houses, products] = await Promise.all([
    all<ParetoDish>("v_pareto_prato", "*", ["unit_id", "produto_id"]),
    all<ParetoSupplier>("v_pareto_fornecedor", "*", ["unit_id", "raiz_cnpj"]),
    all<ParetoIngredient>("v_pareto_insumo", "*", ["unit_id", "insumo_id"]),
    all<{ unit_id: string; produto_venda_ficha_id: string; receita_atribuida: number | null }>("v_mapa_aresta", "unit_id,produto_venda_ficha_id,insumo_id,raiz_cnpj,receita_atribuida", ["unit_id", "produto_venda_ficha_id", "insumo_id", "raiz_cnpj"]),
    all<{ unit_id: string; item_id: string; vl_total: number }>("v_mapa_compra", "unit_id,item_id,id,vl_total", ["id"]),
    all<{ unit_id: string }>("everest_unidades", "unit_id,fora_do_escopo_cmv", ["unit_id"]),
    all<ParetoProduct>("produto_venda_ficha", "id,unit_id,nome_venda_original,receita_12m", ["unit_id", "id"]),
  ]);
  const dishes = completeParetoDishes(confirmedDishes, products);
  const units = [...new Set(houses.filter(h => !(h as { fora_do_escopo_cmv?: boolean }).fora_do_escopo_cmv).map(h => h.unit_id))];
  const totals = units.map(unit => {
    const baseRevenue = edges.filter(e => e.unit_id === unit).reduce((s, e) => s + Number(e.receita_atribuida ?? 0), 0);
    const basePurchase = purchases.filter(e => e.unit_id === unit).reduce((s, e) => s + Number(e.vl_total), 0);
    const curves = [
      { tab: "pratos", base: baseRevenue, curve: classifyPareto(dishes.filter(d => d.unit_id === unit), d => d.receita_atribuida, d => d.produto_id) },
      { tab: "fornecedores", base: basePurchase, curve: classifyPareto(suppliers.filter(d => d.unit_id === unit), d => Number(d.gasto_12m), d => d.raiz_cnpj) },
      { tab: "insumos", base: basePurchase, curve: classifyPareto(ingredients.filter(d => d.unit_id === unit), d => Number(d.compra_12m), d => d.insumo_id) },
    ];
    return { unit, coverage: paretoCoverage(dishes.filter(d => d.unit_id === unit)), tabs: curves.map(({ tab, base, curve }) => ({ tab, base, bars: curve.total, delta: curve.total - base,
      classShares: curve.shares, shareSum: Object.values(curve.shares).reduce((a, b) => a + b, 0),
      unknown: curve.unknown.length, count: curve.bars.length,
      passed: Math.abs(curve.total - base) < .01 && (curve.total === 0 ? curve.bars.every(b => b.band === null && b.accumulated === null) : Math.abs(Object.values(curve.shares).reduce((a, b) => a + b, 0) - 1) < 1e-9) })) };
  });
  gate("O1", totals.every(u => u.tabs.every(t => t.passed)), totals);
  // Literal criterion from Prompt 11. Do not silently replace a supplier check
  // with a dish check; record both populations for review if the names differ.
  const target = dishes.filter(d => /parrillada carne/i.test(d.nome));
  const supplierTarget = suppliers.filter(s => /parrillada carne/i.test(s.nome));
  const roots = new Set(supplierTarget.map(s => s.raiz_cnpj));
  const noDuplicates = new Set(suppliers.map(s => paretoKey(s.unit_id, s.raiz_cnpj))).size === suppliers.length;
  gate("O2", roots.size === 1 && noDuplicates, { target, supplierTarget, noDuplicates,
    criterion: "Parrillada Carne presente em um único grupo fornecedor, sem duplicação de linhas por casa/raiz; conservação da receita em O1." });
  const candidates = units.flatMap(unit => classifyPareto(dishes.filter(d => d.unit_id === unit), d => d.receita_atribuida, d => paretoKey(d.unit_id, d.produto_id)).bars)
    .filter(b => b.band === "C" && b.row.atribuicao_completa && !b.row.assinatura && Number(b.row.insumos_exclusivos) === 1);
  const sample = candidates[0]?.row;
  const direct = sample ? purchases.filter(p => p.unit_id === sample.unit_id && sample.exclusivos_ids.includes(p.item_id)).reduce((s, p) => s + Number(p.vl_total), 0) : null;
  const economy = sample ? menuEconomy(dishes, new Set([paretoKey(sample.unit_id, sample.produto_id)])) : null;
  gate("O3", !!sample && direct !== null && direct > 0 && Math.abs((economy?.purchase ?? 0) - direct) < .01, { sample, direct, economy });
  console.log("O4–O7 exigem sessão real e evidências de interface; este script não os aprova.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
