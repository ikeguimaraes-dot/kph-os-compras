// Parser de Ficha Técnica Everest 3.0 — porte de docs/cardapio/reference_parser.py
//
// Função PURA e agnóstica de ambiente: recebe os text items do pdf.js (cada um
// com `.str` e `.transform`) por página e devolve o shape do cardapio_golden.json:
//   { produtos, insumos, linhas }
//
// O mesmo módulo roda no harness Node (scripts/test-parser.ts) e no browser
// (src/app/cardapio/import-dialog.tsx). Nada de pdf.js específico de browser aqui.
//
// O PDF tem "Page rot: 90". getTextContent() devolve transform=[a,b,c,d,e,f].
// Reconstruímos cada linha projetando os items nos eixos de leitura do próprio
// texto (direção do baseline = (a,b)), agrupando por coordenada perpendicular e
// ordenando pela coordenada ao longo da linha — o que torna o parse invariante à
// rotação da página. Gaps grandes viram separador de 2+ espaços (recria as
// colunas do `pdftotext -layout` que o reference_parser consumia).

// ── Tipos de saída (shape do cardapio_golden.json) ───────────────────────────

export type ProdutoTipo = "produto_acabado" | "subproduto";
export type InsumoTipo = "materia_prima" | "subproduto" | "produto_acabado";

export interface ParsedProduto {
  codigo: string;
  nome: string;
  tipo: ProdutoTipo;
  rendimento: number;
  custo_total: number;
  situacao: string;
}

export interface ParsedInsumo {
  codigo: string;
  nome: string;
  um: string; // UM crua do Everest (UNID/UN/KG/L/ML/GF)
  custo_padrao: number;
  tipo: InsumoTipo;
}

export interface ParsedLinha {
  page: number;
  produto: string; // codigo do produto
  insumo: string; // codigo do insumo
  nome: string;
  um: string;
  quantidade: number; // Q. Baixa Estoque
  q_aplicada: number; // Q. Aplicada
  perda_pct: number; // 100 - %Aprov.
  custo_unitario: number; // V. Custo Médio
  custo_total: number; // quantidade * custo_unitario
  tipo: InsumoTipo;
}

export interface ParsedFichas {
  produtos: ParsedProduto[];
  insumos: ParsedInsumo[];
  linhas: ParsedLinha[];
}

// Item mínimo do pdf.js que precisamos. (TextItem do pdfjs-dist é compatível.)
export interface TextItemLike {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
}

// ── UM Everest → enum UnidadePadrao do banco ─────────────────────────────────

export const UM_MAP: Record<string, string> = {
  UNID: "un",
  UN: "un",
  GF: "un", // GF = garrafa (sem enum próprio → un)
  L: "l",
  ML: "ml",
  KG: "kg",
  G: "g",
};

// Número BR: "1.234,56" → 1234.56 ; "-12,5" → -12.5
const NUM_RE = /-?\d{1,3}(?:\.\d{3})*,\d+|-?\d+,\d+/g;

export function brToFloat(s: string): number {
  return parseFloat(s.replace(/\./g, "").replace(",", "."));
}

function findNums(s: string): string[] {
  return s.match(NUM_RE) ?? [];
}

// Arredonda como o Python round(x, 4) (suficiente p/ reproduzir o golden).
function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 1e4) / 1e4;
}

// ── Reconstrução de linhas a partir dos text items (invariante à rotação) ────

// Tolerância de bucket perpendicular (espaço de texto). Itens cuja coordenada
// perpendicular difere menos que isto pertencem à mesma linha visual. As linhas
// físicas da tabela ficam ~3.8u apart; descrições que quebram em 2+ linhas
// devem permanecer SEPARADAS para a lógica de orphan (pend_desc) funcionar como
// no reference_parser. Itens da mesma linha compartilham perp idêntico.
const LINE_BUCKET = 2.5;

interface Placed {
  str: string;
  along: number; // posição ao longo da linha de leitura
  perp: number; // posição perpendicular (qual linha)
}

// O pdf.js já mescla cada célula da tabela num único item (ex.: "AGUA PANNA
// 500ML"), com items de espaço " " entre as colunas. Reconstruímos a linha
// juntando os items de conteúdo (não-vazios) na ordem de leitura com DOIS
// espaços — reproduzindo as colunas do `pdftotext -layout` que o
// reference_parser consumia (o regex usa \s{2,} como fronteira de coluna e
// espaço simples dentro do nome).
export function reconstructPageLines(items: TextItemLike[]): string[] {
  const placed: Placed[] = [];
  for (const it of items) {
    if (!it.str || it.str.trim() === "") continue; // descarta separadores " "
    const t = it.transform;
    if (!t || t.length < 6) continue;
    const a = t[0]!, b = t[1]!, e = t[4]!, f = t[5]!;
    const scale = Math.hypot(a, b) || 1;
    const ux = a / scale;
    const uy = b / scale;
    // along = projeção de (e,f) na direção de leitura; perp = perpendicular.
    // Invariante à rotação da página (Page rot: 90).
    const along = e * ux + f * uy;
    const perp = -e * uy + f * ux;
    placed.push({ str: it.str.trim(), along, perp });
  }
  if (placed.length === 0) return [];

  // Agrupa por coordenada perpendicular (linha visual).
  placed.sort((p, q) => p.perp - q.perp);
  const groups: Placed[][] = [];
  let cur: Placed[] = [];
  let curPerp = placed[0]!.perp;
  for (const p of placed) {
    if (Math.abs(p.perp - curPerp) > LINE_BUCKET) {
      if (cur.length) groups.push(cur);
      cur = [];
    }
    cur.push(p);
    curPerp = p.perp;
  }
  if (cur.length) groups.push(cur);

  // perp cresce para cima (PDF y-up projetado) → linhas de cima têm perp maior.
  // Texto deve sair de cima para baixo: ordenamos perp decrescente.
  groups.sort((g, h) => avgPerp(h) - avgPerp(g));

  return groups.map((g) => {
    g.sort((p, q) => p.along - q.along);
    return g.map((p) => p.str).join("  ");
  });
}

function avgPerp(g: Placed[]): number {
  let s = 0;
  for (const p of g) s += p.perp;
  return s / g.length;
}

// ── Parse de UMA página (= UMA ficha) — porte direto do reference_parser ─────

interface PageParse {
  produto: ParsedProduto;
  insumos: Array<Omit<ParsedLinha, "page" | "produto">>;
}

const PROD_CODE_RE = /^\s*(\d{6,7})\s/;
const PROD_NAME_RE = /^\s*\d{6,7}\s+(.+?)\s{2,}/;
const INSUMO_ROW_RE = /^\s*(\d{6,7})\s+(.*)/;

export function parsePage(lines: string[]): PageParse | null {
  const hdr = lines.findIndex((l) => l.trim() === "INSUMO");
  if (hdr < 0) return null;

  // ── linha do PRODUTO (acima do header INSUMO) ──
  const prodLine = lines
    .slice(0, hdr)
    .find(
      (l) =>
        PROD_CODE_RE.test(l) &&
        (l.includes("PRODUTO ACABADO") || l.includes("SUBPRODUTO")),
    );
  if (!prodLine) return null;

  const codigo = prodLine.match(PROD_CODE_RE)![1]!;
  const isSub = prodLine.includes("SUBPRODUTO");
  const nums = findNums(prodLine); // [Q.Produção, ..., Custo Produção] (a data não casa)
  // rendimento ← Q. Produção (1ª coluna numérica). NÃO usamos o "Custo Produção"
  // do cabeçalho (nums[-1]) — esse é o custo do LOTE (= rodapé × rendimento). O
  // custo_total da ficha é o "Custo dos Insumos" do RODAPÉ (custo por porção),
  // capturado abaixo.
  const rendimento = nums.length ? brToFloat(nums[0]!) : 1.0;
  const trimmed = prodLine.replace(/\s+$/g, "");
  const toks = trimmed.split(/\s+/);
  const situacao = toks[toks.length - 1] ?? "";
  const nomeM = prodLine.match(PROD_NAME_RE);
  const nome = nomeM ? nomeM[1]!.trim() : "?";

  // ── linhas de INSUMO (entre header e "Custo dos Insumos") ──
  const insumos: PageParse["insumos"] = [];
  let pendDesc: string[] = [];
  let custoRodape: number | null = null; // "Custo dos Insumos" (custo por porção)
  for (let i = hdr + 1; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.includes("Custo dos Insumos")) {
      const fn = findNums(l);
      NUM_RE.lastIndex = 0;
      if (fn.length) custoRodape = brToFloat(fn[fn.length - 1]!);
      break;
    }
    const m = l.match(INSUMO_ROW_RE);
    const isInsumo =
      !!m &&
      (l.includes("MATERIA PRIMA") ||
        l.includes("SUBPRODUTO") ||
        l.includes("PRODUTO ACABADO"));
    if (isInsumo) {
      const ns = findNums(l);
      if (ns.length < 6) {
        pendDesc = [];
        continue;
      }
      const last6 = ns.slice(-6).map(brToFloat);
      const [qApl, aprov, , qBaixa, vMedio] = last6 as [
        number,
        number,
        number,
        number,
        number,
        number,
      ];
      const icod = m![1]!;
      const tipo: InsumoTipo = l.includes("SUBPRODUTO")
        ? "subproduto"
        : l.includes("PRODUTO ACABADO")
          ? "produto_acabado"
          : "materia_prima";
      const lineToks = l.split(/\s+/).filter(Boolean);
      const umRaw = lineToks.find((tk) => tk in UM_MAP);
      let nomeI = m![2]!;
      if (umRaw && nomeI.includes(umRaw)) nomeI = nomeI.split(umRaw)[0]!;
      nomeI = nomeI.replace(/\s{2,}.*$/, "").trim();
      if (pendDesc.length) {
        nomeI = (pendDesc.join(" ") + " " + nomeI).trim();
        pendDesc = [];
      }
      insumos.push({
        insumo: icod,
        nome: nomeI,
        um: umRaw ?? "UN",
        quantidade: qBaixa,
        q_aplicada: qApl,
        perda_pct: round4(100 - aprov),
        custo_unitario: vMedio,
        custo_total: round4(qBaixa * vMedio),
        tipo,
      });
    } else if (l.trim() && !NUM_RE.test(l) && !l.includes("Descrição")) {
      // NUM_RE tem flag global → reseta lastIndex antes de reusar em outro ponto
      NUM_RE.lastIndex = 0;
      pendDesc.push(l.trim().replace(/\s{2,}/g, " "));
    }
    NUM_RE.lastIndex = 0;
  }

  // custo_total = Σ das linhas (= "Custo dos Insumos" do rodapé, custo por
  // porção). Usamos a soma das linhas (reproduz exatamente os insumos exibidos
  // e o servidor reconcilia sem rounding). O rodapé impresso (custoRodape) é só
  // fallback se a ficha não tiver linhas. NUNCA o "Custo Produção" do cabeçalho.
  const somaLinhas = round4(insumos.reduce((s, ins) => s + ins.custo_total, 0));
  const produto: ParsedProduto = {
    codigo,
    nome,
    tipo: isSub ? "subproduto" : "produto_acabado",
    rendimento,
    custo_total: insumos.length > 0 ? somaLinhas : (custoRodape ?? 0),
    situacao,
  };

  return { produto, insumos };
}

// ── Função pública: agrega todas as páginas no shape do golden ───────────────

export function parseFichas(pages: TextItemLike[][]): ParsedFichas {
  const produtos: ParsedProduto[] = [];
  const linhas: ParsedLinha[] = [];
  // insumo distinto por código (primeira ocorrência ganha custo/nome/um/tipo)
  const insumoMap = new Map<string, ParsedInsumo>();

  pages.forEach((items, idx) => {
    const page = idx + 1;
    const lines = reconstructPageLines(items);
    const parsed = parsePage(lines);
    if (!parsed) return;
    produtos.push(parsed.produto);
    for (const ins of parsed.insumos) {
      linhas.push({ page, produto: parsed.produto.codigo, ...ins });
      if (!insumoMap.has(ins.insumo)) {
        insumoMap.set(ins.insumo, {
          codigo: ins.insumo,
          nome: ins.nome,
          um: ins.um,
          custo_padrao: ins.custo_unitario,
          tipo: ins.tipo,
        });
      }
    }
  });

  return { produtos, insumos: [...insumoMap.values()], linhas };
}
