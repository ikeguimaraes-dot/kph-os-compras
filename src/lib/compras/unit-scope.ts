import { z } from "zod";

/** null representa todas as casas autorizadas, nunca ausência de autorização. */
export function parseUnitScope(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
export const unitScope = z.unknown().transform(parseUnitScope);

export function resolveUnitScope(value: unknown, allowed: readonly string[]): string | null {
  const unit = parseUnitScope(value);
  return unit && allowed.includes(unit) ? unit : null;
}

/** Gravações individuais não podem converter o escopo do grupo em uma casa. */
export function requireUnitScope(value: unknown): string {
  const unit = parseUnitScope(value);
  if (!unit) throw new Error("Selecione uma casa específica para salvar este registro.");
  return unit;
}
export const requiredUnitScope = unitScope.transform(requireUnitScope);
