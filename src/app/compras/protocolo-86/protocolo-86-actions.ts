"use server";
import { z } from "zod";
import { comprasAccess } from "@/lib/compras/everest-access";
import { parseUnitScope } from "@/lib/compras/unit-scope";
import type { SupplyRows } from "@/lib/compras/abastecimento-rows";

type Classe86 = "INEGOCIAVEL" | "PROTEGIDO" | "GERENCIAVEL" | "LIVRE";

export type Protocolo86Data = {
  categorias: SupplyRows["compras_86_categoria"][];
  pratos: SupplyRows["v_86_protecao_prato"][];
  insumos: SupplyRows["v_86_heranca_insumo"][];
  episodios: SupplyRows["v_86_episodio_mes"][];
  mesAtual: string;
  placar: {
    rs_perdido_mes: number;
    por_classe: Record<Classe86, number>;
  };
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

export async function getProtocolo86Data(
  unit: string | null,
): Promise<Protocolo86Data> {
  const { db, unitIds } = await comprasAccess(parseUnitScope(unit));

  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
  );
  const mesAtual = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const [categorias, pratos, insumos, episodiosRaw] = await Promise.all([
    readAll(db, "compras_86_categoria", unitIds, "grupo"),
    readAll(db, "v_86_protecao_prato", unitIds, "produto_id"),
    readAll(db, "v_86_heranca_insumo", unitIds, "insumo_id"),
    (async () => {
      const rows: SupplyRows["v_86_episodio_mes"][] = [];
      for (let start = 0; ; start += 1000) {
        const r = await db
          .from("v_86_episodio_mes")
          .select("*")
          .in("unit_id", unitIds)
          .eq("mes_episodio", mesAtual)
          .range(start, start + 999);
        if (r.error) throw new Error(r.error.message);
        rows.push(...(r.data as unknown as SupplyRows["v_86_episodio_mes"][]));
        if (r.data.length < 1000) return rows;
      }
      return rows;
    })(),
  ]);

  const receitaMap = new Map(
    pratos.map((p) => [p.produto_id, p.receita_12m ?? 0]),
  );

  let rs_perdido_mes = 0;
  for (const ep of episodiosRaw) {
    const rec = receitaMap.get(ep.produto_venda_ficha_id) ?? 0;
    rs_perdido_mes += (rec / 52 / 7) * ep.dias_em_falta;
  }

  const classeMap = new Map(
    pratos.map((p) => [p.produto_id, p.classe_86 as Classe86]),
  );
  const por_classe: Record<Classe86, number> = {
    INEGOCIAVEL: 0,
    PROTEGIDO: 0,
    GERENCIAVEL: 0,
    LIVRE: 0,
  };
  for (const ep of episodiosRaw) {
    const cl = classeMap.get(ep.produto_venda_ficha_id) ?? "LIVRE";
    por_classe[cl] = (por_classe[cl] ?? 0) + 1;
  }

  return {
    categorias,
    pratos,
    insumos,
    episodios: episodiosRaw,
    mesAtual,
    placar: { rs_perdido_mes, por_classe },
  };
}

export async function saveTeto(
  unit_id: string,
  grupo: string,
  teto: number,
): Promise<void> {
  z.string().uuid().parse(unit_id);
  z.string().min(1).max(200).parse(grupo);
  z.number().int().min(0).parse(teto);
  const { db } = await comprasAccess(unit_id, "write");
  const { error } = await db.from("compras_86_categoria").upsert(
    { unit_id, grupo, teto_86_simultaneo: teto },
    { onConflict: "unit_id,grupo" },
  );
  if (error) throw new Error(error.message);
}

export async function toggleAssinatura(
  unit_id: string,
  nome_venda_key: string,
  assinatura: boolean,
): Promise<void> {
  z.string().uuid().parse(unit_id);
  z.string().min(1).max(500).parse(nome_venda_key);
  z.boolean().parse(assinatura);
  const { db } = await comprasAccess(unit_id, "write");
  const { error } = await db.from("compras_86_prato").upsert(
    { unit_id, prato: nome_venda_key, assinatura },
    { onConflict: "unit_id,prato" },
  );
  if (error) throw new Error(error.message);
}
