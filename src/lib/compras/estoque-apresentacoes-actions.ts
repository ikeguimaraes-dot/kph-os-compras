"use server";
import { z } from "zod";
import { comprasAccess } from "./everest-access";

const columns = "id,insumo_id,nome,unidade_base,fator_base,minimo_unidades,saldo_unidades,contado_em,atualizado_em";
export type EstoqueApresentacao = {
  id: string; insumo_id: string; nome: string; unidade_base: "KG" | "L" | "UNID";
  fator_base: number; minimo_unidades: number; saldo_unidades: number | null;
  contado_em: string | null; atualizado_em: string;
};
export async function getEstoqueApresentacoes(unitId: string): Promise<EstoqueApresentacao[]> {
  const uid = z.uuid().parse(unitId);
  const { db } = await comprasAccess(uid);
  const rows: EstoqueApresentacao[] = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await db.from("compras_estoque_apresentacoes").select(columns)
      .eq("unit_id", uid).order("nome").order("id").range(offset, offset + 999);
    if (r.error) throw new Error(r.error.message);
    rows.push(...(r.data as EstoqueApresentacao[]));
    if (r.data.length < 1000) break;
  }
  return rows;
}
export async function contarEstoqueApresentacao(raw: {
  unitId: string; id: string; saldo: number; expectedUpdatedAt: string;
}): Promise<EstoqueApresentacao> {
  const v = z.object({ unitId: z.uuid(), id: z.uuid(), saldo: z.number().finite().nonnegative().max(1e9),
    expectedUpdatedAt: z.iso.datetime({ offset: true }) }).parse(raw);
  const { db, user } = await comprasAccess(v.unitId, "write");
  const now = new Date().toISOString();
  const r = await db.from("compras_estoque_apresentacoes").update({
    saldo_unidades: v.saldo, contado_em: now, atualizado_em: now, atualizado_por: user.id,
  }).eq("unit_id", v.unitId).eq("id", v.id).eq("atualizado_em", v.expectedUpdatedAt)
    .select(columns).maybeSingle();
  if (r.error) throw new Error(r.error.message);
  if (!r.data) throw new Error("Registro alterado ou indisponível. Recarregue antes de contar novamente.");
  return r.data as EstoqueApresentacao;
}
