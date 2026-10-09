"use server";
import { z } from "zod";
import { requiredUnitScope } from "./unit-scope";
import { comprasAccess } from "./everest-access";
import type { ParetoDish, ParetoIngredient, ParetoSupplier } from "./prisma-pareto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { completeParetoDishes, type ParetoProduct } from "./prisma-pareto";

const roles = ["founder", "diretoria", "diretor", "comprador", "cfo", "head_financeiro"];
async function readAll<T>(db: SupabaseClient, table: string, units: string[], key: string, columns = "*") {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await db.from(table).select(columns).in("unit_id", units)
      .order("unit_id").order(key).range(offset, offset + 999);
    if (result.error) throw new Error(result.error.message);
    rows.push(...result.data as unknown as T[]);
    if (result.data.length < 1000) return rows;
  }
}
export async function getPareto() {
  const { db, unitIds, user } = await comprasAccess();
  const [dishes, suppliers, ingredients, products] = await Promise.all([
    readAll<ParetoDish>(db, "v_pareto_prato", unitIds, "produto_id"),
    readAll<ParetoSupplier>(db, "v_pareto_fornecedor", unitIds, "raiz_cnpj"),
    readAll<ParetoIngredient>(db, "v_pareto_insumo", unitIds, "insumo_id"),
    readAll<ParetoProduct>(db, "produto_venda_ficha", unitIds, "id", "id,unit_id,nome_venda_original,receita_12m"),
  ]);
  return { dishes: completeParetoDishes(dishes, products), suppliers, ingredients, editableUnits: unitIds.filter(id => user.roles.some(
    r => roles.includes(r.role.toLowerCase()) && (r.unitId === null || r.unitId === id))) };
}
export async function markSignature(raw: unknown) {
  const v = z.object({ unit_id: requiredUnitScope, produto_id: z.uuid() }).parse(raw);
  const { db, user } = await comprasAccess(v.unit_id);
  if (!user.roles.some(r => roles.includes(r.role.toLowerCase()) && (r.unitId === null || r.unitId === v.unit_id)))
    throw new Error("Seu perfil não pode marcar assinatura nesta casa.");
  const product = await db.from("produto_venda_ficha").select("id").eq("id", v.produto_id)
    .eq("unit_id", v.unit_id).eq("status", "confirmado").maybeSingle();
  if (product.error || !product.data) throw new Error("Prato confirmado não encontrado nesta casa.");
  const result = await db.from("compras_prato_assinatura").upsert(
    { ...v, marcado_por: user.id, em: new Date().toISOString() },
    { onConflict: "unit_id,produto_id", ignoreDuplicates: true });
  if (result.error) throw new Error(result.error.message);
  const saved = await db.from("compras_prato_assinatura").select("unit_id,produto_id,em")
    .eq("unit_id", v.unit_id).eq("produto_id", v.produto_id).single();
  if (saved.error) throw new Error(saved.error.message);
  return saved.data;
}
