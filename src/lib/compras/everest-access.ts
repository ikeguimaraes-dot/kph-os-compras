import "server-only";
import {
  createServiceClient,
  createSupabaseServerClient,
} from "@kph/db/supabase/server";
import { requireUser } from "@kph/auth/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export async function comprasAccess(unitId?: string | null) {
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
  const active = await db
    .from("everest_unidades")
    .select("unit_id")
    .eq("fora_do_escopo_cmv", false);
  if (error || active.error)
    throw new Error(error?.message ?? active.error?.message);
  const ids = new Set((active.data ?? []).map((r) => r.unit_id));
  const allowed: { id: string; name: string }[] = [];
  for (const unit of units ?? []) {
    if (!ids.has(unit.id)) continue;
    const result = await scoped.rpc("kph_has_role_for_unit", {
      p_unit_id: unit.id,
    });
    if (result.error) throw new Error(result.error.message);
    if (result.data) allowed.push(unit);
  }
  if (!allowed.length) throw new Error("Nenhuma casa autorizada.");
  if (unitId) {
    z.uuid().parse(unitId);
    if (!allowed.some((u) => u.id === unitId))
      throw new Error("Casa não autorizada.");
  }
  return {
    user,
    db,
    units: allowed,
    unitIds: unitId ? [unitId] : allowed.map((u) => u.id),
  };
}
