"use server";
import { z } from "zod";
import { comprasAccess } from "./everest-access";

export type OrigemReposicao = "compra" | "transferencia" | "producao" | "bloqueado";

export interface EstoqueMinMaxItem {
  insumo_id: string;
  nome: string;
  unidade_medida: string | null;
  estoque_atual: number | null;
  qtd_minima: number | null;
  qtd_maxima: number | null;
  origem_reposicao: OrigemReposicao;
  fornecedor_preferencial_id: string | null;
  fornecedor_preferencial_nome: string | null;
  compra_12m: number;
}

export interface EverestFornecedor {
  id: string;
  nome: string;
  cpf_cnpj: string;
}

export async function getEstoqueMinMaxItems(unit_id: string): Promise<EstoqueMinMaxItem[]> {
  const uid = z.uuid().parse(unit_id);
  const { db } = await comprasAccess(uid);

  // Step 1: Paginate v_mapa_compra and aggregate SUM(vl_total) per item_id in memory
  const compraMap = new Map<string, number>();
  for (let offset = 0; ; offset += 1000) {
    const r = await db
      .from("v_mapa_compra")
      .select("item_id,vl_total")
      .eq("unit_id", uid)
      .not("item_id", "is", null)
      .range(offset, offset + 999);
    if (r.error) throw new Error(r.error.message);
    for (const row of r.data) {
      if (!row.item_id) continue;
      compraMap.set(row.item_id, (compraMap.get(row.item_id) ?? 0) + (row.vl_total ?? 0));
    }
    if (r.data.length < 1000) break;
  }

  const itemIds = [...compraMap.keys()];
  if (itemIds.length === 0) return [];

  // Step 2: Fetch names from everest_itens in batches of 100
  const catalogMap = new Map<string, { descricao: string; unidade_medida: string | null }>();
  for (let i = 0; i < itemIds.length; i += 100) {
    const r = await db
      .from("everest_itens")
      .select("id,descricao,unidade_medida")
      .in("id", itemIds.slice(i, i + 100));
    if (r.error) throw new Error(r.error.message);
    for (const row of r.data) {
      catalogMap.set(row.id, { descricao: row.descricao, unidade_medida: row.unidade_medida ?? null });
    }
  }

  // Step 3: Paginate v_pedido_estoque — latest stock per item_id
  const stockMap = new Map<string, number | null>();
  for (let offset = 0; ; offset += 1000) {
    const r = await db
      .from("v_pedido_estoque")
      .select("item_id,quantidade")
      .eq("unit_id", uid)
      .range(offset, offset + 999);
    if (r.error) throw new Error(r.error.message);
    for (const row of r.data) {
      if (row.item_id) stockMap.set(row.item_id, row.quantidade ?? null);
    }
    if (r.data.length < 1000) break;
  }

  // Step 4: Paginate compras_estoque_minimo — all fields
  const minimoMap = new Map<string, {
    qtd_minima: number | null;
    qtd_maxima: number | null;
    origem_reposicao: OrigemReposicao;
    fornecedor_preferencial_id: string | null;
  }>();
  for (let offset = 0; ; offset += 1000) {
    const r = await db
      .from("compras_estoque_minimo")
      .select("insumo_id,qtd_minima,qtd_maxima,origem_reposicao,fornecedor_preferencial_id")
      .eq("unit_id", uid)
      .range(offset, offset + 999);
    if (r.error) throw new Error(r.error.message);
    for (const row of r.data) {
      if (row.insumo_id) {
        minimoMap.set(row.insumo_id, {
          qtd_minima: row.qtd_minima ?? null,
          qtd_maxima: row.qtd_maxima ?? null,
          origem_reposicao: (row.origem_reposicao as OrigemReposicao) ?? "compra",
          fornecedor_preferencial_id: row.fornecedor_preferencial_id ?? null,
        });
      }
    }
    if (r.data.length < 1000) break;
  }

  // Step 5: Collect fornecedor_preferencial_ids and fetch names
  const fornecedorIds = [...new Set(
    [...minimoMap.values()]
      .map((m) => m.fornecedor_preferencial_id)
      .filter((id): id is string => id != null)
  )];
  const fornecedorNomeMap = new Map<string, string>();
  for (let i = 0; i < fornecedorIds.length; i += 100) {
    const r = await db
      .from("everest_fornecedores")
      .select("id,nome_fantasia,razao_social")
      .in("id", fornecedorIds.slice(i, i + 100));
    if (r.error) throw new Error(r.error.message);
    for (const row of r.data as { id: string; nome_fantasia: string | null; razao_social: string | null }[]) {
      fornecedorNomeMap.set(row.id, row.nome_fantasia || row.razao_social || row.id);
    }
  }

  // Step 6: Merge all data — skip items without a name in everest_itens
  const result: EstoqueMinMaxItem[] = [];
  for (const [insumo_id, compra_12m] of compraMap) {
    const catalog = catalogMap.get(insumo_id);
    if (!catalog) continue;
    const minimo = minimoMap.get(insumo_id);
    const fornId = minimo?.fornecedor_preferencial_id ?? null;
    result.push({
      insumo_id,
      nome: catalog.descricao,
      unidade_medida: catalog.unidade_medida,
      estoque_atual: stockMap.get(insumo_id) ?? null,
      qtd_minima: minimo?.qtd_minima ?? null,
      qtd_maxima: minimo?.qtd_maxima ?? null,
      origem_reposicao: minimo?.origem_reposicao ?? "compra",
      fornecedor_preferencial_id: fornId,
      fornecedor_preferencial_nome: fornId ? (fornecedorNomeMap.get(fornId) ?? null) : null,
      compra_12m,
    });
  }

  result.sort((a, b) => b.compra_12m - a.compra_12m);
  return result;
}

const upsertSchema = z.object({
  unit_id: z.uuid(),
  insumo_id: z.uuid(),
  qtd_minima: z.number().nullable(),
  qtd_maxima: z.number().nullable(),
  origem_reposicao: z.enum(["compra", "transferencia", "producao", "bloqueado"]).default("compra"),
  fornecedor_preferencial_id: z.uuid().nullable().optional(),
});

export async function upsertEstoqueMinMax(
  raw: {
    unit_id: string;
    insumo_id: string;
    qtd_minima: number | null;
    qtd_maxima: number | null;
    origem_reposicao?: OrigemReposicao;
    fornecedor_preferencial_id?: string | null;
  }
): Promise<void> {
  const v = upsertSchema.parse(raw);
  const { db, user } = await comprasAccess(v.unit_id, "write");

  const qtd_minima = v.qtd_minima == null || v.qtd_minima <= 0 ? 0 : v.qtd_minima;
  const qtd_maxima = v.qtd_maxima ?? null;
  const atualizado_por: string | null = user?.id ?? null;

  const r = await db
    .from("compras_estoque_minimo")
    .upsert(
      {
        unit_id: v.unit_id,
        insumo_id: v.insumo_id,
        qtd_minima,
        qtd_maxima,
        origem_reposicao: v.origem_reposicao,
        fornecedor_preferencial_id: v.fornecedor_preferencial_id ?? null,
        atualizado_por,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "unit_id,insumo_id" }
    );
  if (r.error) throw new Error(r.error.message);
}

export async function searchEverestFornecedores(
  unit_id: string,
  q: string
): Promise<EverestFornecedor[]> {
  const uid = z.uuid().parse(unit_id);
  if (!q.trim()) return [];
  const { db } = await comprasAccess(uid);
  const term = q.trim().replace(/[%_]/g, "\\$&");
  const r = await db
    .from("everest_fornecedores")
    .select("id,nome_fantasia,razao_social,cpf_cnpj")
    .or(`nome_fantasia.ilike.%${term}%,razao_social.ilike.%${term}%,cpf_cnpj.ilike.%${term}%`)
    .limit(10);
  if (r.error) throw new Error(r.error.message);
  return (r.data as { id: string; nome_fantasia: string | null; razao_social: string | null; cpf_cnpj: string }[]).map((row) => ({
    id: row.id,
    nome: row.nome_fantasia || row.razao_social || row.id,
    cpf_cnpj: row.cpf_cnpj,
  }));
}
