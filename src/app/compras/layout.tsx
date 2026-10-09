import { cookies } from "next/headers";
import {
  resolveUnitSelection,
  UNIT_COOKIE,
} from "../../../lib/kph/auth/unit-selection";
import { AuthProvider } from "@kph/auth/context";
import { requireUser } from "@kph/auth/server";
import { createSupabaseServerClient } from "@kph/db/supabase/server";
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

  return (
    <AuthProvider user={user} units={units} initialUnitId={initialUnitId}>
      <GhosShell>{children}</GhosShell>
    </AuthProvider>
  );
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
