export type Poll = { periodo_inicio: string; periodo_fim: string; iniciado_em: string; concluido_em: string; total: number };
export function summarizePolls(rows: Poll[], now: number) {
  const ordered = [...rows].sort((a,b)=>Date.parse(b.concluido_em)-Date.parse(a.concluido_em));
  const latest=ordered[0]??null;
  const age=latest ? (now-Date.parse(latest.concluido_em))/60000 : null;
  return { latest, ageMinutes:age, state:age===null?'aguardando':!Number.isFinite(age)||age<0||age>45?'atrasada':'recente',
    windows:rows.length, first:ordered.at(-1)?.iniciado_em??null };
}
