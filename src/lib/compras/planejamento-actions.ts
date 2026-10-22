"use server";

import { comprasAccess } from "./everest-access";
import type { PlanningData } from "./planejamento";

export async function getPlanejamentoVendas(): Promise<PlanningData> {
  // Scope is derived from the authenticated session, never from client IDs.
  const { db, unitIds } = await comprasAccess();
  const { data, error } = await db.rpc("compras_planejamento_vendas", { p_unit_ids: unitIds });
  if (error) throw new Error("Não foi possível carregar as vendas para o planejamento.");
  if (!data || !Array.isArray(data.products) || !Array.isArray(data.units) || !Array.isArray(data.recipes) || !Array.isArray(data.stock)) {
    throw new Error("A base de planejamento retornou dados incompletos.");
  }
  return data as PlanningData;
}
