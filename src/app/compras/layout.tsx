import { cookies } from "next/headers";
import {
  resolveUnitSelection,
  UNIT_COOKIE,
} from "../../../lib/kph/auth/unit-selection";
import { AuthProvider } from "@kph/auth/context";
import { requireUser } from "@kph/auth/server";
import { createSupabaseServerClient, createServiceClient } from "@kph/db/supabase/server";
import type { Unit } from "@kph/db/types/database";
import { GhosShell } from "@/components/ghos/GhosShell";

export const dynamic = "force-dynamic";

export default async function ComprasLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  const units = await loadAccessibleUnits();
  const initialUnitId = resolveUnitSelection(
    (await cookies()).get(UNIT_COOKIE)?.value,
    units,
  );
  const badge86 = await load86Count();

  return (
    <AuthProvider user={user} units={units} initialUnitId={initialUnitId}>
      <GhosShell badge86={badge86}>{children}</GhosShell>
    </AuthProvider>
  );
}

async function load86Count(): Promise<number | undefined> {
  try {
    const service = createServiceClient();
    if (!service) return undefined;
    const { count } = await service.from("v_86_episodio").select("unit_id", { count: "exact", head: true }).is("saida_at", null);
    return count ?? undefined;
  } catch {
    return undefined;
  }
}

async function loadAccessibleUnits(): Promise<Unit[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("units")
      .select("*")
      .eq("active", true)
      .order("name");
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}
