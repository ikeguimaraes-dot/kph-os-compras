"use server";
import { comprasAccess } from "@/lib/compras/everest-access";
import { parseUnitScope } from "@/lib/compras/unit-scope";
import type { SupplyRows } from "@/lib/compras/abastecimento-rows";

export type Pulso86Data = {
  itens: SupplyRows["v_pulso_86"][];
  tetos: SupplyRows["v_pulso_86_teto"][];
};

async function readAll<T extends keyof SupplyRows>(
  db: Awaited<ReturnType<typeof comprasAccess>>["db"],
  table: T,
  ids: string[],
  order = "unit_id",
) {
  const rows: SupplyRows[T][] = [];
  for (let start = 0; ; start += 1000) {
    const r = await db
      .from(table)
      .select("*")
      .in("unit_id", ids)
      .order(order)
      .range(start, start + 999);
    if (r.error) throw new Error(r.error.message);
    rows.push(...(r.data as unknown as SupplyRows[T][]));
    if (r.data.length < 1000) return rows;
  }
}

export async function getPulso86Data(
  unit: string | null,
): Promise<Pulso86Data> {
  const { db, unitIds } = await comprasAccess(parseUnitScope(unit));
  const [itens, tetos] = await Promise.all([
    readAll(db, "v_pulso_86", unitIds, "casa"),
    readAll(db, "v_pulso_86_teto", unitIds, "grupo"),
  ]);
  return { itens, tetos };
}
