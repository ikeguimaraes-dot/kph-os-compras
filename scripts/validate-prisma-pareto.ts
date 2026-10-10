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
    all<{ unit_id: string; produto_venda_ficha_id: string; receita_atribuida: number | null; raiz_cnpj: string | null }>("v_mapa_aresta", "unit_id,produto_venda_ficha_id,insumo_id,raiz_cnpj,receita_atribuida", ["unit_id", "produto_venda_ficha_id", "insumo_id", "raiz_cnpj"]),
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
      { tab: "insumos", base: basePurchase, curve: classifyPareto(ingredients.filter(d => d.unit_id === unit), d => Number(d.compra_12m), d => d.insumo_id ?? "sem-item-vinculado") },
    ];
    return { unit, coverage: paretoCoverage(dishes.filter(d => d.unit_id === unit)), tabs: curves.map(({ tab, base, curve }) => ({ tab, base, bars: curve.total, delta: curve.total - base,
      classShares: curve.shares, shareSum: Object.values(curve.shares).reduce((a, b) => a + b, 0),
      unknown: curve.unknown.length, count: curve.bars.length,
      passed: Math.abs(curve.total - base) < .01 && (curve.total === 0 ? curve.bars.every(b => b.band === null && b.accumulated === null) : Math.abs(Object.values(curve.shares).reduce((a, b) => a + b, 0) - 1) < 1e-9) })) };
  });
  gate("O1", totals.every(u => u.tabs.every(t => t.passed)), totals);
  // O2 revised: conservation per house and per multi-supplier dish.
  // A missing calculable base remains null; it is never asserted to be zero revenue.
  const conservation = units.map(unit => {
    const base = dishes.filter(d => d.unit_id === unit && d.receita_atribuida !== null).reduce((sum, d) => sum + Number(d.receita_atribuida), 0);
    const attributed = suppliers.filter(s => s.unit_id === unit).reduce((sum, s) => sum + Number(s.receita_atribuida), 0);
    return { unit, base, attributed, delta: attributed - base };
  });
  const target = dishes.filter(d => /parrillada carne/i.test(d.nome)).map(d => {
    const parts = edges.filter(e => e.unit_id === d.unit_id && e.produto_venda_ficha_id === d.produto_id);
    const known = parts.filter(e => e.receita_atribuida !== null);
    const total = known.length ? known.reduce((sum, e) => sum + Number(e.receita_atribuida), 0) : null;
    return { dish: d.nome, base: d.receita_atribuida, total, suppliers: new Set(parts.map(e => e.raiz_cnpj).filter(Boolean)).size,
      state: d.receita_atribuida === null ? "Sem base calculável: todos os pedaços devem permanecer nulos" : "Base calculável: conservação do rateio",
      passed: parts.length > 0 && (d.receita_atribuida === null ? known.length === 0 : total !== null && Math.abs(total - Number(d.receita_atribuida)) < .01) };
  });
  const noDuplicates = new Set(suppliers.map(s => paretoKey(s.unit_id, s.raiz_cnpj))).size === suppliers.length;
  const groups = await all<{ raiz_cnpj: string; grupo_id: string }>("compras_fornecedor_grupo", "*", ["raiz_cnpj"]);
  const aliasesAbsent = groups.filter(g => g.raiz_cnpj !== g.grupo_id).every(g => !suppliers.some(s => s.raiz_cnpj === g.raiz_cnpj));
  const canonicalPresent = ["31901640", "27470795"].every(root => suppliers.some(s => s.raiz_cnpj === root));
  gate("O2", conservation.every(c => Math.abs(c.delta) < .01) && target.length > 0 && target.every(t => t.passed) && noDuplicates && aliasesAbsent && canonicalPresent,
    { conservation, target, noDuplicates, groups, aliasesAbsent, canonicalPresent,
      criterion: "Soma dos fornecedores = base calculável dos pratos; Parrillada sem duplicação, inclusive quando sem base; grupos canônicos Popo/Specialli uma vez por casa." });
  const candidates = units.flatMap(unit => classifyPareto(dishes.filter(d => d.unit_id === unit), d => d.receita_atribuida, d => paretoKey(d.unit_id, d.produto_id)).bars)
    .filter(b => b.band === "C" && b.row.atribuicao_completa && !b.row.assinatura && Number(b.row.insumos_exclusivos) === 1);
  const sample = candidates[0]?.row;
  const direct = sample ? purchases.filter(p => p.unit_id === sample.unit_id && sample.exclusivos_ids.includes(p.item_id)).reduce((s, p) => s + Number(p.vl_total), 0) : null;
  const economy = sample ? menuEconomy(dishes, new Set([paretoKey(sample.unit_id, sample.produto_id)])) : null;
  gate("O3", !!sample && direct !== null && direct > 0 && Math.abs((economy?.purchase ?? 0) - direct) < .01, { sample, direct, economy });
  console.log("O4–O7 exigem sessão real e evidências de interface; este script não os aprova.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
