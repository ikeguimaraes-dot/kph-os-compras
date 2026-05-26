import { Suspense } from "react";
import { requireUser } from "@kph/auth/server";
import { getCurrentUnit } from "@kph/auth/unit";
import { listQuotes } from "./actions";
import { CotacoesClient } from "./cotacoes-client";
import { createSupabaseServerClient } from "@kph/db/supabase/server";
import type { SupplierRow } from "@kph/db/types/database";

export const dynamic = "force-dynamic";

export default async function CotacoesPage() {
  await requireUser();
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto" }}>
      <header style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: "var(--text-3)" }}>
          Compras · Cotações
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "6px 0 4px", color: "var(--text)", letterSpacing: -0.4 }}>
          Cotações
        </h1>
        <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0, lineHeight: 1.55, maxWidth: 720 }}>
          Planilha de cotação por fornecedor — crie, envie e compare preços por período.
        </p>
      </header>
      <Suspense fallback={<div style={{ color: "var(--text-3)", fontSize: 13 }}>Carregando…</div>}>
        <CotacoesSection />
      </Suspense>
    </div>
  );
}

async function CotacoesSection() {
  const unit = await getCurrentUnit();
  if (!unit) {
    return (
      <div style={{ background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 8, padding: "32px 22px", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
        Selecione uma unit no topo para ver as cotações.
      </div>
    );
  }
  const now = new Date();
  const supabase = await createSupabaseServerClient();
  const [quotes, suppliersRes] = await Promise.all([
    listQuotes(unit.id, now.getMonth() + 1, now.getFullYear()),
    supabase
      ? supabase.from("suppliers").select("id, nome").eq("unit_id", unit.id).eq("ativo", true).order("nome")
      : Promise.resolve({ data: [], error: null }),
  ]);
  const typedRes = suppliersRes as { data: Pick<SupplierRow, "id" | "nome">[] | null; error: { message: string } | null };
  if (typedRes.error) console.error("[CotacoesSection/suppliers]", typedRes.error.message);
  const suppliers = (typedRes.data ?? []) as Pick<SupplierRow, "id" | "nome">[];
  return <CotacoesClient unitId={unit.id} quotes={quotes} suppliers={suppliers} defaultMes={now.getMonth() + 1} defaultAno={now.getFullYear()} />;
}
