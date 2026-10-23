"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { comprasAccess } from "./everest-access";
import { buildIngredientDemand } from "./planejamento";
import { reviewSchema, type WeekSnapshot, type WeekReview, type Replenishment } from "./semana";

export async function getWeekPlanning(week: string) {
  const parsed = z.iso.date().parse(week);
  const { db, unitIds } = await comprasAccess();
  const snapshots = await db.from("compras_semana_snapshot").select("*")
    .eq("week_start", parsed).in("unit_id", unitIds).order("review_date", { ascending: false });
  if (snapshots.error) throw new Error("Não foi possível ler a revisão semanal.");
  const data = snapshots.data as WeekSnapshot[];
  if (!data.length) return { snapshots: data, reviews: [] as WeekReview[] };
  const policies: (Replenishment & { unit_id: string })[] = [];
  for (let offset = 0; ; offset += 1000) {
    const p = await db.from("compras_estoque_minimo").select("unit_id,insumo_id,origem_reposicao,qtd_minima,qtd_maxima")
      .in("unit_id", unitIds).order("unit_id").order("insumo_id").range(offset, offset + 999);
    if (p.error) throw new Error("Não foi possível conferir a origem de reposição.");
    policies.push(...p.data); if (p.data.length < 1000) break;
  }
  for (const s of data) s.current_policies = policies.filter(p => p.unit_id === s.unit_id);
  const reviews: WeekReview[] = [];
  const seen = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const r = await db.from("compras_semana_revisao").select("id,snapshot_id,item_key,inputs,created_at")
      .in("unit_id", unitIds).in("snapshot_id", data.map(s => s.id))
      .order("created_at", { ascending: false }).order("id").range(offset, offset + 999);
    if (r.error) throw new Error("Não foi possível ler as conferências.");
    for (const row of r.data) {
      const key = `${row.snapshot_id}:${row.item_key}`;
      if (!seen.has(key)) { reviews.push({ ...row.inputs, id: row.id, created_at: row.created_at }); seen.add(key); }
    }
    if (r.data.length < 1000) break;
  }
  return { snapshots: data, reviews };
}

export async function captureWeek(week: string) {
  const parsed = z.iso.date().parse(week);
  const { db, unitIds } = await comprasAccess();
  const r = await db.rpc("compras_semana_capturar", { p_week_start: parsed, p_unit_ids: unitIds });
  if (r.error) throw new Error("Não foi possível registrar a leitura. Use a sexta anterior ou um dia da semana-alvo.");
  revalidatePath("/compras");
  return r.data as number;
}

export async function saveWeekReview(raw: unknown) {
  const v = reviewSchema.parse(raw);
  const { db, user } = await comprasAccess(v.unit_id, "write");
  const snapshot = await db.from("compras_semana_snapshot").select("*").eq("id", v.snapshot_id).eq("unit_id", v.unit_id).single();
  if (snapshot.error || !snapshot.data) throw new Error("Revisão fora da casa autorizada.");
  const s = snapshot.data as WeekSnapshot;
  const item = buildIngredientDemand(s.planning).find(r => r.key === v.item_key && r.unit_id === v.unit_id);
  if (!item?.measure) throw new Error("Item ou unidade de medida não confirmado nesta leitura.");
  const policy = await db.from("compras_estoque_minimo").select("origem_reposicao")
    .eq("unit_id", v.unit_id).eq("insumo_id", item.item_id).maybeSingle();
  if (policy.error) throw new Error("Não foi possível conferir a origem da reposição.");
  if (policy.data?.origem_reposicao === "transferencia") throw new Error("Este insumo está cadastrado para transferência. Confira a origem antes de propor compra direta.");
  const r = await db.from("compras_semana_revisao").insert({ snapshot_id: s.id, unit_id: v.unit_id,
    item_key: v.item_key, inputs: v, created_by: user.id }).select("id,created_at").single();
  if (r.error) throw new Error("Não foi possível salvar a conferência.");
  revalidatePath("/compras");
  return { ...v, ...r.data } as WeekReview;
}
