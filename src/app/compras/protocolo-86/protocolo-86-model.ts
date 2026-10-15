import type { Protocolo86Data } from "./protocolo-86-actions";

export type Classe86 = "INEGOCIAVEL" | "PROTEGIDO" | "GERENCIAVEL" | "LIVRE";
export const CLASSES: Classe86[] = [
  "INEGOCIAVEL",
  "PROTEGIDO",
  "GERENCIAVEL",
  "LIVRE",
];
export const CLASSE_LABEL: Record<Classe86, string> = {
  INEGOCIAVEL: "Inegociável",
  PROTEGIDO: "Protegido",
  GERENCIAVEL: "Gerenciável",
  LIVRE: "Livre",
};
export const CLASSE_DESCRIPTION: Record<Classe86, string> = {
  INEGOCIAVEL: "Pareto A e assinatura da casa ou categoria com limite zero.",
  PROTEGIDO: "Prato Pareto A ou assinatura da casa.",
  GERENCIAVEL: "Prato Pareto B: acompanhar disponibilidade e alternativas.",
  LIVRE:
    "Pareto C ou sem classificação de vendas. A falta ainda precisa de acompanhamento.",
};
export const rowKey = (unit: string, id: string) => JSON.stringify([unit, id]);
export const normalizeSearch = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
export const classRank = (value: string) => {
  const index = CLASSES.indexOf(value as Classe86);
  return index < 0 ? CLASSES.length : index;
};
export function limitState(open: number, limit: number) {
  if (open > limit) return "exceeded";
  if (open > 0 && open === limit) return "at-limit";
  return "within";
}

// Limits count distinct dishes, not repeated reports. Scope by house so that
// categories with the same name in different houses never share a count.
export function openSummary(data: Protocolo86Data) {
  const dishes = new Set<string>();
  const categories = new Map<string, number>();
  const byDish = new Map(
    data.pratos.map((p) => [rowKey(p.unit_id, p.produto_id), p]),
  );
  let critical = 0;
  for (const episode of data.episodios) {
    if (!episode.aberto) continue;
    const key = rowKey(episode.unit_id, episode.produto_venda_ficha_id);
    if (dishes.has(key)) continue;
    dishes.add(key);
    const dish = byDish.get(key);
    if (dish?.classe_86 === "INEGOCIAVEL") critical++;
    if (dish?.grupo) {
      const groupKey = rowKey(episode.unit_id, dish.grupo);
      categories.set(groupKey, (categories.get(groupKey) ?? 0) + 1);
    }
  }
  return { dishes, categories, critical };
}
