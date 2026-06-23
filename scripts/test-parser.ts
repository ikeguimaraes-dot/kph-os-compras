/**
 * Harness Node — valida o parser PURO (src/lib/cardapio/parse-fichas.ts) contra
 * o PDF REAL do repo (arquivos/index.pdf) e compara com o oráculo + golden.
 *
 *   npx tsx scripts/test-parser.ts            # roda a validação completa
 *   npx tsx scripts/test-parser.ts --debug 1  # dump das linhas reconstruídas da pág 1
 *
 * Usa o build legacy do pdfjs-dist (compatível com Node, sem worker DOM).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// build legacy = roda em Node sem DOM/worker
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  parseFichas,
  reconstructPageLines,
  type TextItemLike,
} from "../src/lib/cardapio/parse-fichas.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PDF_PATH = path.join(ROOT, "arquivos", "index.pdf");
const GOLDEN_PATH = path.join(ROOT, "docs", "cardapio", "cardapio_golden.json");

async function loadPages(): Promise<TextItemLike[][]> {
  const data = new Uint8Array(fs.readFileSync(PDF_PATH));
  const doc = await pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;
  const pages: TextItemLike[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items: TextItemLike[] = content.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((it: any) => typeof it.str === "string")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((it: any) => ({
        str: it.str,
        transform: it.transform,
        width: it.width,
        height: it.height,
      }));
    pages.push(items);
  }
  return pages;
}

function fmt(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function main() {
  const debugArgIdx = process.argv.indexOf("--debug");
  const pages = await loadPages();
  console.log(`PDF: ${pages.length} páginas`);

  if (debugArgIdx >= 0) {
    const pageNum = Number(process.argv[debugArgIdx + 1] ?? "1");
    const lines = reconstructPageLines(pages[pageNum - 1]!);
    console.log(`\n── Página ${pageNum} reconstruída (${lines.length} linhas) ──`);
    lines.forEach((l, i) => console.log(String(i).padStart(3), JSON.stringify(l)));
    return;
  }

  const out = parseFichas(pages);
  const { produtos, insumos, linhas } = out;

  const acabados = produtos.filter((p) => p.tipo === "produto_acabado");
  const subs = produtos.filter((p) => p.tipo === "subproduto");
  const sumAcab = acabados.reduce((s, p) => s + p.custo_total, 0);

  // reconcile: Σ(q·custo_unitario) das linhas ≈ custo_total (= "Custo dos
  // Insumos" do RODAPÉ). NÃO multiplica por rendimento (isso seria o lote).
  const byProd = new Map<string, typeof linhas>();
  for (const l of linhas) {
    const arr = byProd.get(l.produto) ?? [];
    arr.push(l);
    byProd.set(l.produto, arr);
  }
  let recOk = 0;
  for (const p of produtos) {
    const ls = byProd.get(p.codigo) ?? [];
    const sum = ls.reduce((s, l) => s + l.quantidade * l.custo_unitario, 0);
    if (sum === 0 || Math.abs(sum - p.custo_total) <= 0.02) recOk++;
  }

  const um = new Set([...insumos.map((i) => i.um)]);

  console.log("\n── RESULTADO DO PARSE ──");
  console.log(`fichas:            ${produtos.length}   (esperado 936)`);
  console.log(`  produto_acabado: ${acabados.length}   (esperado 598)`);
  console.log(`  subproduto:      ${subs.length}   (esperado 338)`);
  console.log(`insumos distintos: ${insumos.length}   (esperado 1007)`);
  console.log(`linhas:            ${linhas.length}   (esperado 2725)`);
  console.log(`reconciliam:       ${recOk}/${produtos.length}   (esperado 936/936, vs RODAPÉ)`);
  console.log(`Σ custo acabados:  R$ ${fmt(sumAcab)}   (esperado ≈ R$ 42.375,00)`);
  console.log(`UMs:               ${[...um].sort().join(", ")}`);

  // ── Comparação com o golden ──
  const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf-8"));
  const diff = compareGolden(out, golden);

  const oracle =
    produtos.length === 936 &&
    acabados.length === 598 &&
    subs.length === 338 &&
    insumos.length === 1007 &&
    linhas.length === 2725 &&
    recOk === 936 &&
    Math.abs(sumAcab - 42375.0) <= 1.0;

  console.log("\n── ORÁCULO ──");
  console.log(oracle ? "✅ ORÁCULO BATEU" : "❌ ORÁCULO NÃO BATEU");
  console.log(
    diff.equal
      ? "✅ GOLDEN: deep-equal exato"
      : `⚠️  GOLDEN: ${diff.summary}`,
  );
  if (!diff.equal) diff.examples.forEach((e) => console.log("   ", e));

  process.exit(oracle ? 0 : 1);
}

interface CmpResult {
  equal: boolean;
  summary: string;
  examples: string[];
}

function compareGolden(out: ParsedOut, golden: ParsedOut): CmpResult {
  const examples: string[] = [];
  const round = (n: number) => Math.round(n * 1e4) / 1e4;

  // produtos por codigo
  const gProd = new Map(golden.produtos.map((p) => [p.codigo, p]));
  const oProd = new Map(out.produtos.map((p) => [p.codigo, p]));
  let prodDiff = 0;
  for (const [cod, g] of gProd) {
    const o = oProd.get(cod);
    if (!o) {
      prodDiff++;
      if (examples.length < 12) examples.push(`produto faltando: ${cod} ${g.nome}`);
      continue;
    }
    if (
      o.nome !== g.nome ||
      o.tipo !== g.tipo ||
      round(o.rendimento) !== round(g.rendimento) ||
      round(o.custo_total) !== round(g.custo_total)
    ) {
      prodDiff++;
      if (examples.length < 12)
        examples.push(
          `produto ${cod}: got ${JSON.stringify({ n: o.nome, t: o.tipo, r: o.rendimento, c: o.custo_total })} want ${JSON.stringify({ n: g.nome, t: g.tipo, r: g.rendimento, c: g.custo_total })}`,
        );
    }
  }
  for (const cod of oProd.keys())
    if (!gProd.has(cod)) {
      prodDiff++;
      if (examples.length < 12) examples.push(`produto extra: ${cod}`);
    }

  // insumos por codigo
  const gIns = new Map(golden.insumos.map((i) => [i.codigo, i]));
  const oIns = new Map(out.insumos.map((i) => [i.codigo, i]));
  let insDiff = 0;
  for (const [cod, g] of gIns) {
    const o = oIns.get(cod);
    if (!o) {
      insDiff++;
      continue;
    }
    if (o.nome !== g.nome || o.um !== g.um || round(o.custo_padrao) !== round(g.custo_padrao) || o.tipo !== g.tipo)
      insDiff++;
  }
  insDiff += [...oIns.keys()].filter((c) => !gIns.has(c)).length;

  // linhas: bucket por (produto, insumo)
  let lineDiff = Math.abs(out.linhas.length - golden.linhas.length);

  const equal = prodDiff === 0 && insDiff === 0 && out.linhas.length === golden.linhas.length;
  return {
    equal,
    summary: `produtos≠${prodDiff}, insumos≠${insDiff}, Δlinhas=${lineDiff}`,
    examples,
  };
}

interface ParsedOut {
  produtos: Array<{ codigo: string; nome: string; tipo: string; rendimento: number; custo_total: number }>;
  insumos: Array<{ codigo: string; nome: string; um: string; custo_padrao: number; tipo: string }>;
  linhas: unknown[];
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
