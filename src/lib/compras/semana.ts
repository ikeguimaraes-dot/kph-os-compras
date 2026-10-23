import { z } from "zod";
import { average, buildIngredientDemand, stockAge, WINDOWS, type PlanningData, type IngredientDemand } from "./planejamento";

export type OpenOrder = { numero: string; status: string; data_pedido: string; data_prevista: string | null; items: { nome: string; unidade: string; quantidade: number; quantidade_recebida: number | null }[] };
export type Replenishment = { insumo_id: string; origem_reposicao: string | null; qtd_minima: number | null; qtd_maxima: number | null };
export type WeekSnapshot = { id: string; week_start: string; review_date: string; unit_id: string; created_at: string; planning: PlanningData; open_orders: OpenOrder[]; current_policies?: Replenishment[] };
const amount = z.number().finite().min(0).max(1e9);
const note = z.string().trim().min(12, "Descreva a origem e a conferência (mínimo 12 caracteres).").max(2000);
export const reviewSchema = z.object({
  snapshot_id: z.uuid(), unit_id: z.uuid(), item_key: z.string().min(1).max(200),
  demand: amount, demand_note: note,
  opening_stock: amount, stock_note: note,
  incoming: amount, incoming_note: note,
  safety: amount, safety_note: note,
  pack: z.number().finite().min(0.000001).max(1e9), pack_note: note,
  checked: z.literal(true),
});
export type ReviewInput = z.infer<typeof reviewSchema>;
export type WeekReview = ReviewInput & { id: string; created_at: string };
export function netProposal(review: ReviewInput | null | undefined) {
  if (!review || !reviewSchema.safeParse(review).success) return null;
  const raw = Math.max(0, review.demand + review.safety - review.opening_stock - review.incoming);
  const packs = Math.ceil(raw / review.pack);
  return { raw, packs, quantity: packs * review.pack };
}
export function targetWeek(today: string) {
  const d = new Date(`${today}T12:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + (day >= 5 ? 8 - day : 1 - day));
  return d.toISOString().slice(0, 10);
}
export function addDays(value: string, days: number) {
  return new Date(Date.parse(`${value}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
export function mappedProducts(data: PlanningData) {
  const keys = new Set(data.recipes.map(r => `${r.unit_id}:${r.ficha_id}`));
  return data.products.filter(p => p.confirmed && p.ficha_id && keys.has(`${p.unit_id}:${p.ficha_id}`));
}
export function reference(row: IngredientDemand) {
  // The established default remains eight weeks. Fallbacks are explicit, never zero.
  const window = ([8, 4, 12] as const).find(w => {
    const n = average(row, w); return n != null && Number.isFinite(n) && n >= 0;
  });
  return window ? { window, quantity: average(row, window)! } : null;
}
export function operationalRows(snapshot: WeekSnapshot) {
  const data = snapshot.planning;
  return buildIngredientDemand(data).map(row => {
    const unit = data.units.find(u => u.id === row.unit_id)!;
    const ref = reference(row);
    const policy = snapshot.current_policies?.find(p => p.insumo_id === row.item_id);
    const alerts = [
      ...(row.days86 > 0 ? ["86 histórico em produto associado; conferir disponibilidade atual e demanda reprimida."] : []),
      ...(!row.measure ? ["Unidade do insumo ausente."] : []),
      ...(!ref ? ["Nenhuma janela com quantidade calculável; revisar qualidade das vendas."] : []),
      ...(WINDOWS.some(w => average(row, w) == null) ? ["Há janelas sem cálculo confiável; não significam consumo zero."] : []),
      ...(ref && unit[`days${ref.window}`] < ref.window * 7 ? ["Histórico incompleto: distinguir fechamento da casa de falha de coleta."] : []),
      ...(!row.stock ? ["Sem inventário Everest para o item."] : (stockAge(data.as_of, row.stock) ?? 999) > 1 ? ["Inventário antigo: conciliar entradas, saídas, transferências e perdas; contar o utilizável."] : ["Inventário registrado não comprova estoque utilizável no início da semana."]),
      ...(row.stock && row.stock.measure !== row.measure ? ["Unidades de estoque e ficha divergentes."] : []),
      "Conferir rendimentos, embalagem, segurança e entregas no prazo; não descontados automaticamente.",
      ...(policy?.origem_reposicao === "transferencia" ? ["Cadastro atual indica transferência: conferir casa de origem e disponibilidade; compra direta bloqueada nesta lista."] : ["Conferir origem de reposição: compra, produção interna ou transferência."]),
      ...(policy ? [`Parâmetros atuais: mínimo ${policy.qtd_minima ?? "não informado"}; máximo ${policy.qtd_maxima ?? "não informado"}. Mínimo cadastrado não foi presumido como estoque de segurança.`] : []),
    ];
    const dependencies = new Set(row.dishes).size;
    const priority = row.days86 > 0 ? 0 : !ref || !row.measure || dependencies >= 5 ? 1 : 2;
    return { ...row, snapshot_id: snapshot.id, unit_name: unit.name, reference: ref, priority, alerts, dependencies, replenishment: policy?.origem_reposicao ?? null };
  }).sort((a, b) => a.priority - b.priority || b.dependencies - a.dependencies || a.name.localeCompare(b.name, "pt-BR"));
}
export function consolidateProposals(rows: ReturnType<typeof operationalRows>, reviews: WeekReview[]) {
  const groups = new Map<string, { name: string; measure: string | null; rows: typeof rows; quantity: number | null; reviewed: number }>();
  for (const row of rows) {
    // Unknown units are not consolidated across houses.
    const key = `${row.item_id}:${row.measure ?? row.unit_id}`;
    const group = groups.get(key) ?? { name: row.name, measure: row.measure, rows: [], quantity: 0, reviewed: 0 };
    const review = reviews.find(r => r.snapshot_id === row.snapshot_id && r.item_key === row.key);
    const net = row.measure && row.replenishment !== "transferencia" ? netProposal(review) : null;
    group.rows.push(row);
    group.quantity = group.quantity == null || net == null ? null : group.quantity + net.quantity;
    group.reviewed += net == null ? 0 : 1;
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => ({ key, ...group }));
}
