/**
 * Verifica OFFLINE a matemática do import (sem DB): reconciliação, contagem de
 * links subproduto↔ficha e nº de linhas, usando o cardapio_golden.json. As
 * fórmulas aqui devem ser idênticas às de src/app/api/cardapio/import/route.ts.
 *
 *   npx tsx scripts/test-import-logic.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ParsedFichas } from "../src/lib/cardapio/parse-fichas.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const golden: ParsedFichas = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "..", "docs", "cardapio", "cardapio_golden.json"), "utf-8"),
);

const linhasByProduto = new Map<string, ParsedFichas["linhas"]>();
for (const l of golden.linhas) {
  const arr = linhasByProduto.get(l.produto) ?? [];
  arr.push(l);
  linhasByProduto.set(l.produto, arr);
}

let reconcileOk = 0;
for (const p of golden.produtos) {
  const ls = linhasByProduto.get(p.codigo) ?? [];
  const sum = ls.reduce((s, l) => s + l.quantidade * l.custo_unitario, 0);
  const calc = sum * (p.rendimento || 1);
  if (sum === 0 || Math.abs(calc - p.custo_total) <= 0.02) reconcileOk++;
}

const produtoCodes = new Set(golden.produtos.map((p) => p.codigo));
const links = golden.insumos.filter((i) => produtoCodes.has(i.codigo)).length;

const checks: Array<[string, number, number]> = [
  ["menu_items (upsert)", golden.produtos.length, 936],
  ["ingredients (upsert)", golden.insumos.length, 1007],
  ["recipe_items (insert)", golden.linhas.length, 2725],
  ["links subproduto↔ficha", links, 311],
  ["reconciliam", reconcileOk, 936],
];

let allOk = true;
for (const [label, got, want] of checks) {
  const ok = got === want;
  allOk &&= ok;
  console.log(`${ok ? "✅" : "❌"} ${label}: ${got} (esperado ${want})`);
}
process.exit(allOk ? 0 : 1);
