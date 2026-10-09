export const ALL_UNITS = "all";
export const UNIT_COOKIE = "kph_unit_id";

/** Resolve somente casas acessíveis. "all" é escopo de leitura, nunca uma FK. */
export function resolveUnitSelection(
  stored: string | null | undefined,
  units: ReadonlyArray<{ id: string }>,
): string | null {
  if (!units.length) return null;
  if (stored === ALL_UNITS) return ALL_UNITS;
  return units.some((unit) => unit.id === stored) ? stored! : units[0]!.id;
}
