import { AuthProvider } from "@kph/auth/context";
import { requireUser } from "@kph/auth/server";
import { createSupabaseServerClient } from "@kph/db/supabase/server";
import type { Unit } from "@kph/db/types/database";
import { Sidebar } from "@kph/ui/sidebar";

export const dynamic = "force-dynamic";

export default async function ComprasLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  const units = await loadAccessibleUnits();

  return (
    <AuthProvider user={user} units={units}>
      <div style={{ display: "flex", height: "100vh" }}>
        <Sidebar />
        <main style={{ flex: 1, overflowY: "auto", padding: "32px 28px" }}>
          {children}
        </main>
      </div>
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
