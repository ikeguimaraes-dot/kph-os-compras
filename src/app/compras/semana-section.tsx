import { getWeekPlanning } from "@/lib/compras/semana-actions";
import { saoPauloToday } from "@/lib/compras/pedidos";
import { targetWeek } from "@/lib/compras/semana";
import { SemanaClient } from "./semana-client";

export async function SemanaSection({ unitId }: { unitId: string | null }) {
  const today = saoPauloToday();
  const week = targetWeek(today);
  const result = await getWeekPlanning(week).catch(() => null);
  if (!result) return <p role="status" className="plan-notice">A lista operacional semanal não pôde ser carregada. Não interprete como lista vazia. O planejamento histórico permanece abaixo.</p>;
  return <SemanaClient key={`${unitId}:${result.snapshots.map(s => s.id).join()}`} week={week} today={today} {...result} initialUnitId={unitId} />;
}
