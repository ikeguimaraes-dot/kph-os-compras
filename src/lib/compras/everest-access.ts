import "server-only";
import {
  createServiceClient,
  createSupabaseServerClient,
} from "@kph/db/supabase/server";
import { requireUser } from "@kph/auth/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseUnitScope } from "./unit-scope";

export async function comprasAccess(input?: string | null, mode: "read" | "write" = "read") {
  const unitId = parseUnitScope(input);
  if (mode === "write" && input != null && !unitId)
    throw new Error("Selecione a casa do registro antes de salvar.");
  const user = await requireUser();
  const session = await createSupabaseServerClient();
  const service = createServiceClient();
  if (!session || !service) throw new Error("Conexão com a base indisponível.");
  const scoped = session as unknown as SupabaseClient;
  const db = service as unknown as SupabaseClient;
  const { data: units, error } = await scoped
    .from("units")
    .select("id,name")
    .order("name");
  if (error) throw new Error(error.message);
  const allowed: { id: string; name: string }[] = [];
  for (const unit of units ?? []) {
    const result = await scoped.rpc("kph_has_role_for_unit", {
      p_unit_id: unit.id,
    });
    if (result.error) throw new Error(result.error.message);
    if (result.data) allowed.push(unit);
  }
  if (!allowed.length) throw new Error("Nenhuma casa autorizada.");
  if (unitId) {
    if (!allowed.some((u) => u.id === unitId))
      throw new Error("Casa não autorizada.");
  }
  return {
    user,
    db,
    unitId,
    units: allowed,
    unitIds: unitId ? [unitId] : allowed.map((u) => u.id),
  };
}
