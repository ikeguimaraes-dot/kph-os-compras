"use server";
import { z } from "zod";
import { comprasAccess } from "./everest-access";

export type EstoqueItem = {
  item_id: string;
  descricao: string;
  unidade_medida: string | null;
  quantidade: number | null;
  qtd_minima: number | null;
  status: "OK" | "85" | "ZERADO" | "SEM_MINIMO";
};

export type EstoqueMinimoData = {
  items: EstoqueItem[];
  units: { id: string; name: string }[];
  resumo: { em_85: number; zerados: number; sem_minimo: number };
};

export async function getEstoqueMinimo(unit: string | null): Promise<EstoqueMinimoData> {
  const { db, units, unitIds } = await comprasAccess(unit ?? undefined);

  // Stock from v_pedido_estoque
  const stocks: { item_id: string; quantidade: number | null; unidade_medida: string | null }[] = [];
  for (let offset = 0; ; offset += 1000) {
    let q = db.from("v_pedido_estoque").select("item_id,quantidade,unidade_medida");
    if (unit) q = q.eq("unit_id", unit);
    else q = q.in("unit_id", unitIds);
    const r = await q.order("item_id").range(offset, offset + 999);
    if (r.error) throw new Error(r.error.message);
    stocks.push(...(r.data as typeof stocks));
    if (r.data.length < 1000) break;
  }

  const itemIds = [...new Set(stocks.map((s) => s.item_id).filter(Boolean))];

  // Descriptions from everest_itens
  const catalog: { id: string; descricao: string; unidade_medida: string | null }[] = [];
  for (let i = 0; i < itemIds.length; i += 100) {
    const r = await db.from("everest_itens").select("id,descricao,unidade_medida").in("id", itemIds.slice(i, i + 100));
    if (r.error) throw new Error(r.error.message);
    catalog.push(...r.data);
  }

  // Minimums from compras_estoque_minimo
  const minimos: { unit_id: string; insumo_id: string; qtd_minima: number }[] = [];
  for (let offset = 0; ; offset += 1000) {
    let q = db.from("compras_estoque_minimo").select("unit_id,insumo_id,qtd_minima");
    if (unit) q = q.eq("unit_id", unit);
    else q = q.in("unit_id", unitIds);
    const r = await q.order("insumo_id").range(offset, offset + 999);
    if (r.error) throw new Error(r.error.message);
    minimos.push(...(r.data as typeof minimos));
    if (r.data.length < 1000) break;
  }

  const minimoMap = new Map(minimos.map((m) => [`${m.unit_id}:${m.insumo_id}`, m.qtd_minima]));

  // Aggregate stock per item (across all selected units)
  const stockMap = new Map<string, { quantidade: number | null; unidade_medida: string | null }>();
  for (const s of stocks) {
    const prev = stockMap.get(s.item_id);
    if (!prev) {
      stockMap.set(s.item_id, { quantidade: s.quantidade, unidade_medida: s.unidade_medida });
    } else {
      stockMap.set(s.item_id, {
        quantidade: prev.quantidade != null && s.quantidade != null ? prev.quantidade + s.quantidade : null,
        unidade_medida: prev.unidade_medida ?? s.unidade_medida,
      });
    }
  }

  // For per-unit minimum, map is unit+item. For "all units" we aggregate per item.
  const minimoPerItem = new Map<string, number | null>();
  for (const [key, qtd] of minimoMap.entries()) {
    const insumoId = key.split(":")[1] ?? "";
    const prev = minimoPerItem.get(insumoId);
    if (prev === undefined) minimoPerItem.set(insumoId, qtd);
    else if (prev !== null) minimoPerItem.set(insumoId, prev + qtd);
  }
  // Items with no minimum entry at all → null
  for (const id of itemIds) {
    if (!minimoPerItem.has(id)) minimoPerItem.set(id, null);
  }

  const items: EstoqueItem[] = catalog
    .sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"))
    .map((c) => {
      const s = stockMap.get(c.id);
      const qtd = s?.quantidade ?? null;
      const qtdMin = minimoPerItem.get(c.id) ?? null;

      let status: EstoqueItem["status"] = "SEM_MINIMO";
      if (qtdMin !== null) {
        if (qtd === null || qtd === 0) status = "ZERADO";
        else if (qtd < qtdMin) status = "85";
        else status = "OK";
      }

      return {
        item_id: c.id,
        descricao: c.descricao,
        unidade_medida: s?.unidade_medida ?? c.unidade_medida,
        quantidade: qtd,
        qtd_minima: qtdMin,
        status,
      };
    });

  const resumo = {
    em_85: items.filter((i) => i.status === "85").length,
    zerados: items.filter((i) => i.status === "ZERADO").length,
    sem_minimo: items.filter((i) => i.status === "SEM_MINIMO").length,
  };

  return { items, units: units.map((u) => ({ id: u.id, name: u.name })), resumo };
}

export async function saveEstoqueMinimo(raw: unknown): Promise<void> {
  const v = z
    .object({
      unit_id: z.string().uuid(),
      insumo_id: z.string().uuid(),
      qtd_minima: z.number().min(0),
    })
    .parse(raw);

  const { db, user } = await comprasAccess(v.unit_id, "write");
  const { error } = await db.from("compras_estoque_minimo").upsert(
    {
      unit_id: v.unit_id,
      insumo_id: v.insumo_id,
      qtd_minima: v.qtd_minima,
      atualizado_por: user.id,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "unit_id,insumo_id" },
  );
  if (error) throw new Error(error.message);
}
