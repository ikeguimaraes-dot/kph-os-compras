export const CAUSAS = [
  "fornecedor_bloqueado_pagamento",
  "pedido_nao_feito",
  "atraso_entrega",
  "indisponivel_mercado",
  "qualidade_reprovada",
  "erro_estoque",
  "producao_planejamento",
  "sazonalidade",
] as const;
export const TIPOS = [
  "planejado",
  "ruptura",
  "qualidade",
  "sazonalidade",
] as const;
export const STATUS = [
  "aberto",
  "causa_confirmada",
  "acordo_em_negociacao",
  "aguardando_entrega",
  "retomado",
  "planejado",
] as const;
export const DISTRIBUIDORES = [
  "Bidfood",
  "Vinhais",
  "Aroumar",
  "MegaG",
  "PMG",
] as const;
export function availablePopularity(qty: number, days: number | null) {
  return days !== null && days > 0 ? qty / days : null;
}
export function canRemoveSignature(
  approvals: { role: string; user: string }[],
) {
  return approvals.some(
    (a) =>
      a.role === "founder" &&
      approvals.some((b) => b.role === "chef" && b.user !== a.user),
  );
}
export type Agreement = {
  id: string;
  unit_id: string;
  fornecedor_raiz: string;
  pratos_liberados: string[];
  desembolso_total_rs: number;
  data_entrega: string | null;
  entrega_confirmada: boolean;
  qualidade_confirmada: boolean;
  todos_insumos_confirmados: boolean;
  status: string;
  prazo_recebimento_dias: number;
};
export type Contribution = {
  produto_venda_ficha_id: string;
  contribuicao_dia: number | null;
  dias_disponiveis: number;
};
export function rankAgreements(
  rows: Agreement[],
  contributions: Contribution[],
  signatureIds: Set<string>,
  budget: number | null,
  factor: number,
  today: string,
) {
  const costs = new Map(
    contributions.map((r) => [r.produto_venda_ficha_id, r]),
  );
  const calc = (a: Agreement) => {
    const dishes = [...new Set(a.pratos_liberados)];
    const covered =
      dishes.length > 0 &&
      dishes.every(
        (id) =>
          costs.get(id)?.contribuicao_dia != null &&
          Number(costs.get(id)?.dias_disponiveis) > 0,
      );
    const daily = covered
      ? dishes.reduce(
          (s, id) => s + Math.max(0, Number(costs.get(id)!.contribuicao_dia)),
          0,
        ) * factor
      : null;
    const delay = a.data_entrega
      ? Math.max(
          0,
          Math.ceil(
            (Date.parse(a.data_entrega + "T12:00:00Z") -
              Date.parse(today + "T12:00:00Z")) /
              86400000,
          ),
        )
      : Infinity;
    const c7 = daily === null ? null : daily * Math.max(0, 7 - delay),
      c14 = daily === null ? null : daily * Math.max(0, 14 - delay);
    const eligible =
      a.status === "validado" &&
      a.entrega_confirmada &&
      a.qualidade_confirmada &&
      a.todos_insumos_confirmados &&
      a.data_entrega !== null &&
      a.data_entrega >= today &&
      Number(a.desembolso_total_rs) > 0 &&
      c14 !== null &&
      c14 > 0;
    return {
      ...a,
      c7,
      c14,
      daily,
      covered,
      eligible,
      signature: dishes.some((id) => signatureIds.has(id)),
      score: eligible ? c14! / Number(a.desembolso_total_rs) : null,
      recebimento7:
        daily === null
          ? null
          : daily * Math.max(0, 7 - delay - a.prazo_recebimento_dias),
    };
  };
  const sorted = rows
    .filter((a) => !["descartado", "concluido"].includes(a.status))
    .map(calc)
    .sort(
      (a, b) =>
        (b.score ?? -1) - (a.score ?? -1) ||
        Number(b.signature) - Number(a.signature) ||
        a.id.localeCompare(b.id),
    );
  let remaining = budget;
  const allocated = new Set<string>();
  return sorted.map((a) => {
    // Shared dishes require a single consolidated proposal. Never credit the same recovery twice.
    const overlap = a.pratos_liberados.some((id) => allocated.has(id));
    const fits =
      a.eligible &&
      !overlap &&
      remaining !== null &&
      Number(a.desembolso_total_rs) <= remaining;
    if (fits) {
      remaining! -= Number(a.desembolso_total_rs);
      a.pratos_liberados.forEach((id) => allocated.add(id));
    }
    return { ...a, fits, overlap, remaining };
  });
}
