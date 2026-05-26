// Tipos do módulo Notificações in-app (migration 024).

import type { NotificationRow } from "@kph/db/types/database";

export type Notification = NotificationRow;

/** Tipos predefinidos. Adicione novos conforme integra mais módulos. */
export type NotificationTipo =
  | "avaliacao_concluida"
  | "ferias_aprovada"
  | "ferias_rejeitada"
  | "pedido_compra_status";

export const TIPO_LABEL: Record<NotificationTipo | string, string> = {
  avaliacao_concluida: "Avaliação concluída",
  ferias_aprovada: "Férias aprovada",
  ferias_rejeitada: "Férias rejeitada",
  pedido_compra_status: "Pedido de compra",
};

/** Tempo relativo curto pt-BR. "agora", "há 2 min", "há 3h", "há 2d". */
export function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Math.max(0, Date.now() - t);
  const sec = Math.floor(diff / 1000);
  if (sec < 30) return "agora";
  const min = Math.floor(sec / 60);
  if (min < 1) return `há ${sec}s`;
  if (min < 60) return `há ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `há ${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `há ${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `há ${w}sem`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `há ${mo} mes${mo === 1 ? "" : "es"}`;
  const y = Math.floor(d / 365);
  return `há ${y}a`;
}
