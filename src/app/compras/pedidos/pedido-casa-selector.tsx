"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useUnit } from "@kph/auth/context";

export function PedidoCasaSelector() {
  const { unitId, units, setUnit } = useUnit();
  return <div style={{ marginBottom: 24 }}>
    <label style={{ display: "grid", gap: 8, maxWidth: 360 }}>
      Restaurante do pedido
      <select value={unitId ?? ""} onChange={event => setUnit(event.target.value)}
        style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--text)" }}>
        <option value="" disabled>Selecione um restaurante</option>
        <option value="all" disabled>Todas as casas — escolha um restaurante</option>
        {units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
      </select>
    </label>
    {(!unitId || unitId === "all") && <p role="status" style={{ marginTop: 12 }}>
      Escolha o restaurante acima para carregar o pedido por fornecedor.
    </p>}
  </div>;
}

export function PedidoRetry() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button disabled={pending} onClick={() => startTransition(() => router.refresh())}
    style={{ textDecoration: "underline", padding: 8 }}>
    {pending ? "Carregando…" : "Tentar novamente"}
  </button>;
}
