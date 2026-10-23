"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addDays, consolidateProposals, mappedProducts, netProposal, operationalRows, reviewSchema,
  type WeekReview, type WeekSnapshot } from "@/lib/compras/semana";
import { WINDOWS, average } from "@/lib/compras/planejamento";
import { captureWeek, saveWeekReview } from "@/lib/compras/semana-actions";
import "./semana.css";

const n = (v: number | null | undefined) => v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const date = (d: string) => d.slice(0, 10).split("-").reverse().join("/");
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
type Row = ReturnType<typeof operationalRows>[number];
const fields = [
  ["demand", "demand_note", "Demanda bruta da semana", "Inclua rendimento validado (sem aplicar perda duas vezes), consumo ainda sem ficha, eventos e revisão do 86. Justifique a janela e os ajustes."],
  ["opening_stock", "stock_note", "Estoque utilizável na abertura de segunda", "Informe contagem, data e conciliação de entradas, saídas, perdas, reservas e transferências. Na sexta, desconte o consumo previsto do fim de semana e identifique a projeção."],
  ["incoming", "incoming_note", "Entregas confirmadas antes da abertura", "Identifique pedidos e confirmação do prazo. Exclua recebimentos já incluídos no estoque acima. Entregas durante a semana exigem plano por dia e não são abatidas aqui."],
  ["safety", "safety_note", "Estoque de segurança", "Informe critério aprovado para variabilidade, prazo de reposição e perecibilidade. Zero também precisa de justificativa."],
  ["pack", "pack_note", "Conteúdo por embalagem de compra", "Quantidade na unidade-base do insumo por embalagem. Confira conversão com fornecedor e Everest; não deduza pelo nome."],
] as const;

export function SemanaClient({ week, today, snapshots, reviews: initialReviews, initialUnitId }: {
  week: string; today: string; snapshots: WeekSnapshot[]; reviews: WeekReview[]; initialUnitId: string | null;
}) {
  const router = useRouter();
  const dates = [...new Set(snapshots.map(s => s.review_date))].sort().reverse();
  const [reading, setReading] = useState(dates[0] ?? today);
  const [unit, setUnit] = useState(initialUnitId ?? "all");
  const [mode, setMode] = useState<"items" | "group" | "missing">("items");
  const [query, setQuery] = useState("");
  const [priorityOnly, setPriorityOnly] = useState(false);
  const [reviews, setReviews] = useState(initialReviews);
  const [selected, setSelected] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const units = [...new Map(snapshots.flatMap(s => s.planning.units.map(u => [u.id, u] as const))).values()];
  const current = snapshots.filter(s => s.review_date === reading && (unit === "all" || s.unit_id === unit));
  const allRows = useMemo(() => current.flatMap(operationalRows).sort((a, b) => a.priority - b.priority || b.dependencies - a.dependencies || a.name.localeCompare(b.name, "pt-BR")), [current]);
  const rows = allRows.filter(r => fold(`${r.name} ${r.unit_name}`).includes(fold(query)) && (!priorityOnly || r.priority < 2));
  const missing = current.flatMap(s => {
    const mapped = new Set(mappedProducts(s.planning).map(p => p.key));
    return s.planning.products.filter(p => !mapped.has(p.key)).map(p => ({ ...p, unit_name: s.planning.units[0]?.name ?? "Casa sem nome" }));
  }).sort((a, b) => Number(b.days86 > 0) - Number(a.days86 > 0) || (b.w4 ?? -1) - (a.w4 ?? -1));
  const groups = consolidateProposals(rows, reviews);
  const fridayRows = snapshots.filter(s => s.review_date === addDays(week, -3)).flatMap(operationalRows);
  const friday = new Map(fridayRows.map(r => [r.key, r]));
  const openOrders = current.flatMap(s => s.open_orders.map(o => ({ ...o, unit_name: s.planning.units[0]?.name ?? "Casa sem nome" })));
  const reviewFor = (r: Row) => reviews.find(v => v.snapshot_id === r.snapshot_id && v.item_key === r.key);
  const open = (r: Row) => { setSelected(r); setError(""); dialog.current?.showModal(); };
  const capture = async () => {
    setBusy(true); setMessage("");
    try { const count = await captureWeek(week); setMessage(count ? `Leitura de hoje registrada para ${count} casa(s).` : "A leitura de hoje já está preservada. O histórico ao vivo continua abaixo."); router.refresh(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Falha ao registrar leitura."); }
    finally { setBusy(false); }
  };
  const save = async (form: FormData) => {
    if (!selected) return;
    const raw: Record<string, unknown> = { snapshot_id: selected.snapshot_id, unit_id: selected.unit_id, item_key: selected.key, checked: form.get("checked") === "on" };
    for (const [key, note] of fields) { const value = String(form.get(key) ?? "").trim(); raw[key] = value === "" ? null : Number(value); raw[note] = form.get(note); }
    const parsed = reviewSchema.safeParse(raw);
    if (!parsed.success) { setError("Preencha todos os números e as justificativas. Campo vazio é desconhecido; zero deve ser informado explicitamente. Confirme a revisão ao final."); return; }
    setBusy(true); setError("");
    try { const saved = await saveWeekReview(parsed.data); setReviews(old => [saved, ...old.filter(r => !(r.snapshot_id === saved.snapshot_id && r.item_key === saved.item_key))]); dialog.current?.close(); }
    catch (e) { setError(e instanceof Error ? e.message : "Falha ao salvar."); }
    finally { setBusy(false); }
  };
  return <section className="week-board" aria-label="Lista operacional semanal">
    <header className="week-head"><div><span className="plan-eyebrow">LISTA PARA REVISÃO · SEM ENVIO A FORNECEDORES</span>
      <h2>Semana de {date(week)} a {date(addDays(week, 6))}</h2><p>Sexta {date(addDays(week, -3))}: preparar. Segunda {date(week)}: atualizar vendas, conferir estoque e evitar compras duplicadas.</p></div>
      <button className="week-primary" disabled={busy || today < addDays(week, -3) || today > addDays(week, 6)} onClick={capture}>{busy ? "Registrando…" : "Registrar leitura de hoje"}</button></header>
    <p className="week-warning"><strong>Demanda histórica não é compra líquida.</strong> As médias abaixo cobrem apenas os vínculos confirmados. Quantidades revisadas são estimativas informadas, sujeitas à sua aprovação. Sem conferência, comprar permanece “A confirmar”.</p>
    {message && <p role="status">{message}</p>}
    <div className="week-controls"><label>Leitura preservada<select value={reading} onChange={e => setReading(e.target.value)}>{dates.map(d => <option key={d} value={d}>{date(d)}{d === addDays(week, -3) ? " · sexta" : d === week ? " · segunda" : ""}</option>)}</select></label>
      <label>Restaurante<select value={unit} onChange={e => setUnit(e.target.value)}><option value="all">Todas as casas autorizadas</option>{units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
      <label>Buscar<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Ingrediente ou produto" /></label></div>
    {!snapshots.some(s => s.review_date === week) && <p className="week-note">Revisão de segunda {date(week)} ainda não registrada. A leitura de sexta será mantida; as conferências não serão copiadas automaticamente.</p>}
    <div className="week-stats"><div><strong>{allRows.length}</strong><span>insumos × casas mapeados</span></div><div><strong>{allRows.filter(r => r.priority === 0).length}</strong><span>com 86 histórico associado</span></div><div><strong>{missing.length}</strong><span>produtos sem conversão em insumos</span></div><div><strong>{allRows.filter(r => netProposal(reviewFor(r))).length} / {allRows.length}</strong><span>estimativas revisadas · nenhuma autorizada aqui</span></div></div>
    <details className="week-evidence"><summary>Cobertura e evidências por restaurante</summary>
      <div className="plan-table-wrap"><table className="plan-table"><thead><tr><th>Casa</th><th>Produtos com ficha / vendidos</th><th>Dias com dados 4 / 8 / 12</th><th>Última venda</th><th>Inventário mais recente</th></tr></thead><tbody>{current.map(s => { const u = s.planning.units[0]!; const latest = s.planning.stock.map(v => v.to).sort().at(-1); return <tr key={s.id}><td>{u.name}</td><td>{mappedProducts(s.planning).length} / {s.planning.products.length}</td><td>{u.days4}/28 · {u.days8}/56 · {u.days12}/84</td><td>{u.latest ? date(u.latest) : "Sem dados"}</td><td>{latest ? date(latest) : "Sem posição"}<small>Não comprova saldo utilizável atual.</small></td></tr>; })}</tbody></table></div>
      <p>Fonte: Lorean para vendas; Everest para composição e inventário. O rendimento de produção entra na ficha explodida; aproveitamento, conversões e validade da ficha precisam de revisão. Movimentos e provas sem escopo confirmado não atualizam o saldo automaticamente. Dias ausentes podem ser fechamentos ou falhas; não foram imputados.</p>
    </details>
    <div className="plan-tabs" role="tablist" aria-label="Visão da lista operacional">{([["items", "Insumos por casa"], ["group", "Consolidado de reposição"], ["missing", "Produtos sem ficha"]] as const).map(([key, label]) => <button key={key} role="tab" aria-selected={mode === key} onClick={() => setMode(key)}>{label}</button>)}</div>
    {mode !== "missing" && <label className="week-check"><input type="checkbox" checked={priorityOnly} onChange={e => setPriorityOnly(e.target.checked)} /> Prioridades P0 e P1</label>}
    <p className="week-note">P0: conferir hoje por histórico de 86. P1: base inválida ou insumo presente em pelo menos 5 produtos. P2: demais itens mapeados. É ordem de conferência; não comprova falta atual nem define a lista aprovada de itens que não podem faltar.</p>
    <div className="plan-table-wrap" tabIndex={0} aria-label="Lista operacional; deslize para ver todas as colunas">
      {mode === "items" ? <table className="plan-table week-table"><thead><tr><th>Prioridade · insumo / casa</th>{WINDOWS.map(w => <th key={w}>{w} semanas<small>consumo teórico / semana</small></th>)}<th>Referência provisória</th><th>Comprar</th><th>Conferência</th></tr></thead><tbody>{rows.map(r => {
        const review = reviewFor(r); const net = r.replenishment === "transferencia" ? null : netProposal(review); const previous = friday.get(r.key);
        const delta = previous?.reference && r.reference && previous.reference.window === r.reference.window ? r.reference.quantity - previous.reference.quantity : null;
        return <tr key={r.key}><td><span className={`plan-badge ${r.priority === 0 ? "red" : r.priority === 1 ? "amber" : "green"}`}>P{r.priority}</span><button className="plan-row-button" onClick={() => open(r)}>{r.name}</button><small>{r.unit_name} · {r.measure ?? "Unidade pendente"} · {r.dependencies} produtos</small><small>Reposição cadastrada agora: {r.replenishment ?? "a confirmar"}</small>{r.days86 > 0 && <small>86 histórico associado · conferir situação atual</small>}</td>{WINDOWS.map(w => <td key={w}>{n(average(r, w))}</td>)}<td>{r.reference ? <>{n(r.reference.quantity)} {r.measure}<small>{r.reference.window} semanas{r.reference.window !== 8 ? " · alternativa: 8 sem. indisponível" : ""}</small></> : "Sem base confiável"}{reading !== addDays(week, -3) && <small>Δ sexta: {delta == null ? "não comparável" : n(delta)} {r.measure}</small>}</td><td>{net ? <><strong>{n(net.quantity)} {r.measure}</strong><small>{n(net.packs)} embalagens · estimativa revisada</small><small>Não autorizada</small></> : <span className="plan-badge amber">A confirmar</span>}</td><td><button className="week-link" onClick={() => open(r)}>{review ? "Ver / revisar justificativa" : "Conferir quantidade"}</button><small>{r.stock ? `Estoque histórico: ${n(r.stock.quantity)} ${r.stock.measure ?? ""} (${date(r.stock.from)}${r.stock.to !== r.stock.from ? ` a ${date(r.stock.to)}` : ""})` : "Sem estoque comprovado"}</small></td></tr>;
      })}</tbody></table> : mode === "group" ? <table className="plan-table"><thead><tr><th>Insumo Everest</th><th>Casas e referências teóricas</th><th>Reposição consolidada</th><th>Conferidas</th></tr></thead><tbody>{groups.map(g => <tr key={g.key}><td><strong>{g.name}</strong><small>{g.measure ?? "Unidade pendente"}</small></td><td>{g.rows.map(r => <small key={r.key}>{r.unit_name}: {n(r.reference?.quantity)} {r.measure} ({r.reference?.window ?? "—"} sem.)</small>)}</td><td>{g.quantity == null ? "A confirmar — há casa pendente" : <>{n(g.quantity)} {g.measure}<small>Estimativa revisada, sem autorização</small></>}</td><td>{g.reviewed} / {g.rows.length}</td></tr>)}</tbody></table> : <table className="plan-table"><thead><tr><th>Produto / casa</th>{WINDOWS.map(w => <th key={w}>{w} semanas<small>vendas / semana</small></th>)}<th>Ação antes da compra</th></tr></thead><tbody>{missing.filter(p => fold(`${p.name} ${p.unit_name}`).includes(fold(query))).map(p => <tr key={`${p.unit_id}:${p.key}`}><td>{p.days86 > 0 && <span className="plan-badge red">86 histórico</span>}<strong>{p.name}</strong><small>{p.unit_name}</small></td>{WINDOWS.map(w => <td key={w}>{n(average(p, w))}</td>)}<td>Vincular ficha ou revenda ao cadastro Everest.<small>Quantidade de ingrediente desconhecida; não convertida em zero.</small></td></tr>)}</tbody></table>}
    </div>
    {!current.length && <p className="week-warning">Nenhuma leitura preservada nesta seleção. Registre a leitura de hoje para começar.</p>}
    <details className="week-evidence"><summary>Pedidos existentes para conciliação · {openOrders.length} · nenhum abatido automaticamente</summary><p>Ausência de pedido registrado não prova ausência de encomenda. Nomes e unidades de pedidos antigos não são vínculo confirmado com o insumo Everest.</p>{openOrders.map((o, i) => <details key={i}><summary>{o.unit_name} · {o.numero} · {o.status} · pedido {date(o.data_pedido)} · entrega {o.data_prevista ? date(o.data_prevista) : "sem prazo confirmado"}</summary><ul>{o.items.map((item, j) => <li key={j}>{item.nome}: pedido {n(item.quantidade)} {item.unidade}; recebido registrado {n(item.quantidade_recebida)}. Conferir unidade e situação.</li>)}</ul></details>)}</details>
    <dialog ref={dialog} className="plan-dialog week-dialog" aria-label="Conferência da compra semanal" onClose={() => setSelected(null)}><button type="button" className="plan-close" onClick={() => dialog.current?.close()} aria-label="Fechar conferência">×</button>
      {selected && <><span className="plan-eyebrow">{selected.unit_name} · LEITURA {date(reading)}</span><h3>{selected.name}</h3><p>Semana {date(week)} a {date(addDays(week, 6))}. Todos os valores na unidade <strong>{selected.measure ?? "a confirmar"}</strong>.</p>
        <ul className="week-alerts">{selected.alerts.map(a => <li key={a}>{a}</li>)}</ul>
        <details><summary>Produtos que consomem o insumo</summary><p>{[...new Set(selected.dishes)].join(" · ")}</p></details>
        <p className="week-warning">Na sexta, o estoque de segunda é uma projeção. Revalidar após o fim de semana. A demanda deve incluir os usos ausentes do mapeamento. Salvar não comprova os dados nem autoriza compra.</p>
        {selected.measure && selected.replenishment !== "transferencia" ? <form key={`${selected.key}:${reading}`} action={save}>{fields.map(([key, note, label, hint]) => <div className="week-field" key={key}><label>{label}<input type="number" name={key} min={key === "pack" ? "0.000001" : "0"} step="any" required defaultValue={reviewFor(selected)?.[key] ?? ""} /></label><small>{hint}</small><label>Justificativa / fonte<textarea name={note} required minLength={12} maxLength={2000} defaultValue={reviewFor(selected)?.[note] ?? ""} /></label></div>)}
          <p>Fórmula: arredondar para cima em embalagens × máximo(0, demanda + segurança − estoque na abertura − entregas ainda não incluídas nesse estoque). Confirme prazo, fracionamento e validade antes de executar.</p>
          {reviewFor(selected) && <p>Última conferência registrada: {new Date(reviewFor(selected)!.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Nova revisão preserva a anterior.</p>}
          <label className="week-check"><input type="checkbox" name="checked" required /> Confirmei que a reposição é por compra e revisei unidades, rendimentos, cobertura dos usos e a ausência de dupla contagem. Estes valores são uma proposta para revisão.</label>
          {error && <p role="alert" className="week-warning">{error}</p>}<button disabled={busy} type="submit" className="week-primary">{busy ? "Salvando…" : "Salvar proposta e justificativas"}</button>
        </form> : <p>Confirme a unidade e a origem de reposição antes de propor compra direta. Itens cadastrados para transferência exigem verificar a disponibilidade na origem.</p>}</>}
    </dialog>
  </section>;
}
