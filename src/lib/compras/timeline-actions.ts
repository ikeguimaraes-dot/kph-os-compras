"use server";
import { z } from "zod";
import { comprasAccess } from "./everest-access";

export type Episodio86 = {
  unit_id: string;
  produto_id: string;
  ep_num: number;
  produto_nome: string | null;
  casa_nome: string | null;
  entrada_at: string;
  entrada_data: string;
  num_registros: number;
  tipo: string | null;
  causa: string | null;
  primeiro_abastecimento_id: string;
  saida_at: string | null;
  saida_tipo: "voltou_a_vender" | "baixa_manual" | null;
  saida_venda_at: string | null;
  baixa_manual_em: string | null;
  dias_em_86: number;
  receita_semana: number;
};

export type TimelineData = {
  episodios: Episodio86[];
  units: { id: string; name: string }[];
  today: string;
};

export async function get86Timeline(unit: string | null): Promise<TimelineData> {
  const { db, units } = await comprasAccess(unit ?? undefined);
  const today = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  let q = db.from("v_86_episodio").select("*").order("saida_at", { ascending: true, nullsFirst: true }).order("receita_semana", { ascending: false });
  if (unit) q = q.eq("unit_id", unit);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return {
    episodios: (data ?? []) as Episodio86[],
    units: units.map((u) => ({ id: u.id, name: u.name })),
    today,
  };
}

export async function get86AbertosCount(unit: string | null): Promise<number> {
  const { db } = await comprasAccess(unit ?? undefined);
  let q = db.from("v_86_episodio").select("unit_id", { count: "exact", head: true }).is("saida_at", null);
  if (unit) q = q.eq("unit_id", unit);
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

export async function dar86Baixa(raw: unknown): Promise<void> {
  const v = z
    .object({
      abastecimento_id: z.string().uuid(),
      unit_id: z.string().uuid(),
    })
    .parse(raw);

  const { db, user } = await comprasAccess(v.unit_id, "write");
  const { error } = await db
    .from("abastecimento_86")
    .update({ resolvido_por: user.id, resolvido_em: new Date().toISOString(), atualizado_em: new Date().toISOString() })
    .eq("id", v.abastecimento_id)
    .eq("unit_id", v.unit_id)
    .is("resolvido_em", null);
  if (error) throw new Error(error.message);
}
