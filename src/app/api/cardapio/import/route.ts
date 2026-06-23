// Importação semanal das fichas técnicas (parse do PDF Everest feito no browser).
// Recebe o JSON já parseado (shape do cardapio_golden.json) e sincroniza
// ingredients + menu_items + recipe_items de forma IDEMPOTENTE (roda toda semana
// sem duplicar e sem sobrescrever curadoria manual).
//
// Regras do repo: runtime nodejs + CORS em toda resposta + service role.

import { createServiceClient } from "@kph/db/supabase/server";
import {
  UM_MAP,
  type ParsedFichas,
  type ParsedProduto,
  type ParsedInsumo,
  type ParsedLinha,
} from "@/lib/cardapio/parse-fichas";

export const runtime = "nodejs";

const CORS = {
  "Access-Control-Allow-Origin": "https://kph-os.vercel.app",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { headers: CORS });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

const RECONCILE_TOL = 0.02;
const BATCH = 500;
const mapUnidade = (um: string) => UM_MAP[um] ?? "un";

interface ImportBody {
  unitId?: string;
  parsed?: ParsedFichas;
  dryRun?: boolean;
}

interface Divergencia {
  codigo: string;
  nome: string;
  declarado: number;
  calculado: number;
  diff: number;
}

export async function POST(req: Request) {
  let body: ImportBody;
  try {
    body = (await req.json()) as ImportBody;
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const { unitId, parsed, dryRun } = body;
  if (!unitId) return json({ error: "unitId obrigatório" }, 400);
  if (!parsed?.produtos || !parsed.insumos || !parsed.linhas) {
    return json({ error: "parsed inválido (esperado {produtos, insumos, linhas})" }, 400);
  }

  const supabase = createServiceClient();
  if (!supabase) return json({ error: "Supabase service role indisponível" }, 500);

  // ── 1) Resolve brand_id / group_id a partir do unit ──
  const { data: unitRow, error: unitErr } = await supabase
    .from("units")
    .select("id, brand_id, brands(group_id)")
    .eq("id", unitId)
    .maybeSingle();
  if (unitErr) return json({ error: `units lookup: ${unitErr.message}` }, 500);
  if (!unitRow) return json({ error: "unit não encontrada" }, 404);

  const brandId = (unitRow as { brand_id: string }).brand_id;
  const brandsJoin = (unitRow as { brands: { group_id: string } | { group_id: string }[] | null }).brands;
  const groupId = Array.isArray(brandsJoin) ? brandsJoin[0]?.group_id : brandsJoin?.group_id;
  if (!brandId || !groupId) {
    return json({ error: "não foi possível resolver brand_id/group_id da unit" }, 500);
  }

  // ── 2) Reconciliação (defesa): custo_total = Σ(q·cu) das linhas ──
  //   custo_total da ficha é o "Custo dos Insumos" (rodapé / custo por porção),
  //   que é exatamente Σ(quantidade·custo_unitario). NÃO multiplicamos por
  //   rendimento (isso daria o custo do LOTE, que superestima o CMV). Aqui
  //   recalculamos a soma e checamos contra o custo_total recebido — sanity
  //   contra corrupção no transporte — e usamos a soma recalculada na gravação.
  const linhasByProduto = new Map<string, ParsedLinha[]>();
  for (const l of parsed.linhas) {
    const arr = linhasByProduto.get(l.produto) ?? [];
    arr.push(l);
    linhasByProduto.set(l.produto, arr);
  }
  const custoByProduto = new Map<string, number>(); // codigo → Σ(q·cu) recalculado
  const divergentes: Divergencia[] = [];
  let reconcileOk = 0;
  for (const p of parsed.produtos) {
    const ls = linhasByProduto.get(p.codigo) ?? [];
    const sum = round4(ls.reduce((s, l) => s + l.quantidade * l.custo_unitario, 0));
    custoByProduto.set(p.codigo, sum);
    if (Math.abs(sum - p.custo_total) <= RECONCILE_TOL) {
      reconcileOk++;
    } else {
      divergentes.push({
        codigo: p.codigo,
        nome: p.nome,
        declarado: round2(p.custo_total),
        calculado: round2(sum),
        diff: round2(sum - p.custo_total),
      });
    }
  }
  const reconcile = { ok: reconcileOk, total: parsed.produtos.length, divergentes };

  if (dryRun) {
    return json({
      dryRun: true,
      resumo: {
        produtos: parsed.produtos.length,
        insumos: parsed.insumos.length,
        linhas: parsed.linhas.length,
      },
      reconcile,
    });
  }

  try {
    // ── 3) Upsert ingredients por (group_id, codigo) ──
    const insumoCodes = parsed.insumos.map((i) => i.codigo);
    const existingIng = await fetchByCodes(
      supabase,
      "ingredients",
      "id, codigo",
      "group_id",
      groupId,
      insumoCodes,
    );
    const ingByCode = new Map<string, string>(); // codigo → id
    for (const r of existingIng) ingByCode.set(r.codigo as string, r.id as string);

    const newIngredients = parsed.insumos.filter((i) => !ingByCode.has(i.codigo));
    const updIngredients = parsed.insumos.filter((i) => ingByCode.has(i.codigo));

    // inserir novos (categoria='outro', ativo=true — curadoria depois)
    for (const chunk of chunks(newIngredients, BATCH)) {
      const rows = chunk.map((i: ParsedInsumo) => ({
        group_id: groupId,
        codigo: i.codigo,
        nome: i.nome,
        custo_padrao: i.custo_padrao,
        unidade_padrao: mapUnidade(i.um),
        categoria: "outro",
        ativo: true,
      }));
      const { data, error } = await supabase
        .from("ingredients")
        .insert(rows as never)
        .select("id, codigo");
      if (error) throw new Error(`insert ingredients: ${error.message}`);
      for (const r of (data ?? []) as Array<{ id: string; codigo: string }>) {
        ingByCode.set(r.codigo, r.id);
      }
    }

    // atualizar existentes: SÓ custo_padrao e nome (preserva categoria,
    // fornecedor_id, perdas_padrao — curadoria manual).
    await parallelChunks(updIngredients, 25, async (i) => {
      const id = ingByCode.get(i.codigo)!;
      const { error } = await supabase
        .from("ingredients")
        .update({ custo_padrao: i.custo_padrao, nome: i.nome } as never)
        .eq("id", id);
      if (error) throw new Error(`update ingredient ${i.codigo}: ${error.message}`);
    });

    // ── 4) Upsert menu_items por (unit_id, codigo) ──
    const produtoCodes = parsed.produtos.map((p) => p.codigo);
    const existingMi = await fetchByCodes(
      supabase,
      "menu_items",
      "id, codigo",
      "unit_id",
      unitId,
      produtoCodes,
    );
    const miByCode = new Map<string, string>(); // codigo → id
    for (const r of existingMi) miByCode.set(r.codigo as string, r.id as string);

    const newMenuItems = parsed.produtos.filter((p) => !miByCode.has(p.codigo));
    const updMenuItems = parsed.produtos.filter((p) => miByCode.has(p.codigo));

    // inserir novos (preco_venda=0, categoria='outros' — preenchidos à mão depois)
    for (const chunk of chunks(newMenuItems, BATCH)) {
      const rows = chunk.map((p: ParsedProduto) => ({
        brand_id: brandId,
        unit_id: unitId,
        codigo: p.codigo,
        nome: p.nome,
        custo_total: custoByProduto.get(p.codigo) ?? p.custo_total,
        rendimento: p.rendimento,
        is_subproduto: p.tipo === "subproduto",
        ativo: p.situacao.toLowerCase() !== "inativo",
        tem_ficha_tecnica: true,
        categoria: "outros",
        preco_venda: 0,
      }));
      const { data, error } = await supabase
        .from("menu_items")
        .insert(rows as never)
        .select("id, codigo");
      if (error) throw new Error(`insert menu_items: ${error.message}`);
      for (const r of (data ?? []) as Array<{ id: string; codigo: string }>) {
        miByCode.set(r.codigo, r.id);
      }
    }

    // atualizar existentes: SÓ nome, custo_total, rendimento, is_subproduto,
    // ativo, tem_ficha_tecnica. PRESERVA preco_venda e categoria.
    await parallelChunks(updMenuItems, 25, async (p) => {
      const id = miByCode.get(p.codigo)!;
      const { error } = await supabase
        .from("menu_items")
        .update({
          nome: p.nome,
          custo_total: custoByProduto.get(p.codigo) ?? p.custo_total,
          rendimento: p.rendimento,
          is_subproduto: p.tipo === "subproduto",
          ativo: p.situacao.toLowerCase() !== "inativo",
          tem_ficha_tecnica: true,
        } as never)
        .eq("id", id);
      if (error) throw new Error(`update menu_item ${p.codigo}: ${error.message}`);
    });

    // ── 5) Linka subproduto/componente: ingredient.codigo que também é
    //       menu_items.codigo → ingredients.menu_item_id = id da ficha ──
    const toLink = parsed.insumos.filter(
      (i) => miByCode.has(i.codigo) && ingByCode.has(i.codigo),
    );
    await parallelChunks(toLink, 25, async (i) => {
      const { error } = await supabase
        .from("ingredients")
        .update({ menu_item_id: miByCode.get(i.codigo)! } as never)
        .eq("id", ingByCode.get(i.codigo)!);
      if (error) throw new Error(`link ingredient ${i.codigo}: ${error.message}`);
    });
    const linked = toLink.length;

    // ── 6) recipe_items: delete-all + reinsert (estratégia idempotente) ──
    //   Apaga todas as linhas das fichas desta unidade e reinsere em lotes.
    const allMiIds = parsed.produtos.map((p) => miByCode.get(p.codigo)!);
    for (const chunk of chunks(allMiIds, BATCH)) {
      if (chunk.length === 0) continue;
      const { error } = await supabase
        .from("recipe_items")
        .delete()
        .in("menu_item_id", chunk);
      if (error) throw new Error(`delete recipe_items: ${error.message}`);
    }

    const recipeRows = parsed.linhas
      .filter((l) => miByCode.has(l.produto))
      .map((l) => ({
        menu_item_id: miByCode.get(l.produto)!,
        unit_id: unitId,
        ingredient_id: ingByCode.get(l.insumo) ?? null,
        insumo: l.nome,
        unidade: mapUnidade(l.um),
        quantidade: l.quantidade,
        custo_unitario: l.custo_unitario,
        perda_pct: l.perda_pct,
        // custo_total é GENERATED — NÃO inserir.
      }));
    let recipeLines = 0;
    for (const chunk of chunks(recipeRows, BATCH)) {
      if (chunk.length === 0) continue;
      const { error } = await supabase.from("recipe_items").insert(chunk as never);
      if (error) throw new Error(`insert recipe_items: ${error.message}`);
      recipeLines += chunk.length;
    }

    // ── 7) Soft-delete: menu_items da unit cujo codigo não veio no import ──
    const importedSet = new Set(produtoCodes);
    const { data: allMi, error: allErr } = await supabase
      .from("menu_items")
      .select("id, codigo")
      .eq("unit_id", unitId)
      .eq("ativo", true);
    if (allErr) throw new Error(`scan menu_items: ${allErr.message}`);
    const toDeactivate = ((allMi ?? []) as Array<{ id: string; codigo: string | null }>)
      .filter((m) => m.codigo && !importedSet.has(m.codigo))
      .map((m) => m.id);
    let deactivated = 0;
    for (const chunk of chunks(toDeactivate, BATCH)) {
      if (chunk.length === 0) continue;
      const { error } = await supabase
        .from("menu_items")
        .update({ ativo: false } as never)
        .in("id", chunk);
      if (error) throw new Error(`soft-delete menu_items: ${error.message}`);
      deactivated += chunk.length;
    }

    return json({
      ok: true,
      menuItems: {
        inserted: newMenuItems.length,
        updated: updMenuItems.length,
        deactivated,
      },
      ingredients: {
        inserted: newIngredients.length,
        updated: updIngredients.length,
        linked,
      },
      recipeLines,
      reconcile,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro no import" }, 500);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function round4(n: number) {
  return Math.round((n + Number.EPSILON) * 1e4) / 1e4;
}

function* chunks<T>(arr: T[], size: number): Generator<T[]> {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size);
}

// Executa updates por linha com concorrência limitada (evita milhares de
// round-trips sequenciais sem estourar a conexão).
async function parallelChunks<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (const chunk of chunks(items, concurrency)) {
    await Promise.all(chunk.map(fn));
  }
}

// Busca rows por uma lista (potencialmente grande) de códigos, em lotes, para
// não estourar limites de URL/IN do PostgREST.
async function fetchByCodes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  table: string,
  select: string,
  scopeCol: string,
  scopeVal: string,
  codes: string[],
): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  for (const chunk of chunks(codes, BATCH)) {
    if (chunk.length === 0) continue;
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq(scopeCol, scopeVal)
      .in("codigo", chunk);
    if (error) throw new Error(`fetch ${table}: ${error.message}`);
    out.push(...((data ?? []) as Array<Record<string, unknown>>));
  }
  return out;
}
