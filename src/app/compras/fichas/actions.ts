"use server";
import { comprasAccess } from "@/lib/compras/everest-access";
import { requiredUnitScope, parseUnitScope } from "@/lib/compras/unit-scope";


import { revalidatePath } from "next/cache";
import { z } from "zod";

export type PonteRow = { id: string; unit_id: string; nome_venda: string; nome_venda_original: string; ficha_id: string | null; status: string; origem: string; similaridade: number | null; receita_12m: number; qtd_12m: number; atualizado_em: string; sugestoes: { ficha_id: string; nome: string; similaridade: number }[] };
export type FichaOption = { ficha_id: string; descricao: string; item_pai_id: string };
export type PonteData = { rows: PonteRow[]; count: number; total: number; confirmada: number; resolvida: number; pendentes: number };

export async function getPonteUnits(): Promise<{ id: string; name: string }[]> {
  return (await comprasAccess()).units;
}

export async function getPonte(unitId: string | null, status = "pendente", search = "", page = 0): Promise<PonteData> {
  const { db, unitIds } = await comprasAccess(parseUnitScope(unitId));
  const validStatus = z.enum(["pendente", "confirmado", "sem_ficha", "rejeitado"]).parse(status);
  const offset = z.number().int().min(0).max(10000).parse(page) * 40;
  let query = db.from("produto_venda_ficha").select("*", { count: "exact" }).in("unit_id", unitIds).eq("status", validStatus);
  if (search.trim()) query = query.ilike("nome_venda_original", `%${search.trim().slice(0,100)}%`);
  const [list, coverage] = await Promise.all([
    query.order("receita_12m", { ascending: false }).order("id").range(offset, offset + 39),
    db.from("v_ponte_cobertura").select("*").in("unit_id", unitIds),
  ]);
  if (list.error || coverage.error) throw new Error(list.error?.message ?? coverage.error?.message);
  return { rows: list.data as PonteRow[], count: list.count ?? 0, total: (coverage.data ?? []).reduce((sum, row) => sum + Number(row.receita_total ?? 0), 0), confirmada: (coverage.data ?? []).reduce((sum, row) => sum + Number(row.receita_confirmada ?? 0), 0), resolvida: (coverage.data ?? []).reduce((sum, row) => sum + Number(row.receita_resolvida ?? 0), 0), pendentes: (coverage.data ?? []).reduce((sum, row) => sum + Number(row.pendentes ?? 0), 0) };
}

export async function searchFichas(unitId: string, search: string): Promise<FichaOption[]> {
  const { db, unitIds } = await comprasAccess(parseUnitScope(unitId));
  const { data, error } = await db.from("v_ponte_fichas").select("ficha_id,descricao,item_pai_id").in("unit_id", unitIds).ilike("descricao", `%${search.trim().slice(0,100)}%`).order("descricao").limit(50);
  if (error) throw new Error(error.message);
  return data as FichaOption[];
}

export async function decidePonte(input: { id: string; unitId: string; status: string; fichaId: string | null; version: string }): Promise<void> {
  const value = z.object({ id: z.uuid(), unitId: requiredUnitScope, status: z.enum(["confirmado", "sem_ficha", "rejeitado", "pendente"]), fichaId: z.uuid().nullable(), version: z.string().min(1) }).parse(input);
  const { db, user } = await comprasAccess(value.unitId, "write");
  let itemId: string | null = null;
  if (value.status === "confirmado") {
    if (!value.fichaId) throw new Error("Escolha uma ficha da casa.");
    const { data, error } = await db.from("v_ponte_fichas").select("item_pai_id").eq("unit_id", value.unitId).eq("ficha_id", value.fichaId).single();
    if (error || !data) throw new Error("Ficha inválida para esta casa.");
    itemId = data.item_pai_id;
  }
  const now = new Date().toISOString();
  const { data, error } = await db.from("produto_venda_ficha").update({
    status: value.status, origem: "manual", ficha_id: value.status === "confirmado" ? value.fichaId : null,
    item_pai_id: itemId, confirmado_por: user.id, confirmado_em: now, atualizado_em: now,
  }).eq("id", value.id).eq("unit_id", value.unitId).eq("atualizado_em", value.version).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Este produto mudou. Atualize a fila antes de decidir.");
  revalidatePath("/compras/fichas");
  revalidatePath("/compras/prisma");
}
