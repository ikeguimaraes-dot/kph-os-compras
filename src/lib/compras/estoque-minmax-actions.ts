"use server";
import { z } from "zod";
import { comprasAccess } from "./everest-access";

export interface EstoqueMinMaxItem {
  insumo_id: string;
  nome: string;
  unidade_medida: string | null;
  estoque_atual: number | null;
  qtd_minima: number | null;
  qtd_maxima: number | null;
  compra_12m: number;
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

  // Step 4: Paginate compras_estoque_minimo — qtd_minima and qtd_maxima
  const minimoMap = new Map<string, { qtd_minima: number | null; qtd_maxima: number | null }>();
  for (let offset = 0; ; offset += 1000) {
    const r = await db
      .from("compras_estoque_minimo")
      .select("insumo_id,qtd_minima,qtd_maxima")
      .eq("unit_id", uid)
      .range(offset, offset + 999);
    if (r.error) throw new Error(r.error.message);
    for (const row of r.data) {
      if (row.insumo_id) {
        minimoMap.set(row.insumo_id, {
          qtd_minima: row.qtd_minima ?? null,
          qtd_maxima: row.qtd_maxima ?? null,
        });
      }
    }
    if (r.data.length < 1000) break;
  }

  // Step 5: Merge all data — skip items without a name in everest_itens
  const result: EstoqueMinMaxItem[] = [];
  for (const [insumo_id, compra_12m] of compraMap) {
    const catalog = catalogMap.get(insumo_id);
    if (!catalog) continue; // skip items without a name
    const minimo = minimoMap.get(insumo_id);
    result.push({
      insumo_id,
      nome: catalog.descricao,
      unidade_medida: catalog.unidade_medida,
      estoque_atual: stockMap.get(insumo_id) ?? null,
      qtd_minima: minimo?.qtd_minima ?? null,
      qtd_maxima: minimo?.qtd_maxima ?? null,
      compra_12m,
    });
  }

  // Sort by compra_12m descending
  result.sort((a, b) => b.compra_12m - a.compra_12m);
  return result;
}

const upsertSchema = z.object({
  unit_id: z.uuid(),
  insumo_id: z.uuid(),
  qtd_minima: z.number().nullable(),
  qtd_maxima: z.number().nullable(),
});

export async function upsertEstoqueMinMax(
  raw: { unit_id: string; insumo_id: string; qtd_minima: number | null; qtd_maxima: number | null }
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
        atualizado_por,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "unit_id,insumo_id" }
    );
  if (r.error) throw new Error(r.error.message);
}
