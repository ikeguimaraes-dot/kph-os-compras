/** A fixed weekly purchase is independent of counted stock and stock limits. */
export function weeklyPurchaseQuantity(suggested: number, counted: number | null, fixed: number | null | undefined): number {
  if (fixed != null) {
    if (!Number.isFinite(fixed) || fixed <= 0) throw new Error("Compra fixa semanal inválida.");
    return fixed;
  }
  return counted == null ? suggested : Math.max(0, suggested - counted);
}

export function includeFixedItems<T extends { insumo_id: string }>(
  history: T[], policies: ReadonlyMap<string, { compra_fixa_semanal: number | null }>,
  missing: (id: string) => T,
): T[] {
  const rows = history.filter(row => policies.has(row.insumo_id));
  const present = new Set(rows.map(row => row.insumo_id));
  for (const [id, policy] of policies) {
    if (policy.compra_fixa_semanal != null && !present.has(id)) rows.push(missing(id));
  }
  return rows;
}
