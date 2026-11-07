"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ArrowRight, ChartNoAxesCombined, Check, Layers3, Search, X } from "lucide-react";
import { WINDOWS, average, buildIngredientDemand, consolidateDemand, stockAge, sumDemand,
  type Averages, type IngredientDemand, type PlanningData, type SalesProduct, type WindowWeeks } from "@/lib/compras/planejamento";
import "./planejamento.css";

const number = (n: number | null | undefined, decimals = 1) => n == null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: decimals });
const date = (d: string | null | undefined) => d ? d.slice(0, 10).split("-").reverse().join("/") : "Sem posição";
const weekday = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function Trend({ row }: { row: Averages }) {
  if (row.w4 == null || row.w12 == null || row.w12 <= 0) return <span className="plan-muted">Sem base</span>;
  const pct = (row.w4 / row.w12 - 1) * 100;
  return <span className={`plan-trend ${pct > 5 ? "up" : pct < -5 ? "down" : ""}`}>
    {pct > 5 ? <ArrowUpRight size={14} /> : pct < -5 ? <ArrowDownRight size={14} /> : <ArrowRight size={14} />}
    {number(Math.abs(pct), 0)}%
  </span>;
}

function Bars({ row, selected }: { row: Averages; selected: WindowWeeks }) {
  const max = Math.max(...WINDOWS.map(w => average(row, w) ?? 0), 1);
  return <div className="plan-bars" aria-label="Comparação das médias semanais">
    {WINDOWS.map(w => <div key={w} className={w === selected ? "chosen" : ""}>
      <span>{w} sem.</span><div className="plan-track"><i style={{ width: `${Math.max(0, (average(row, w) ?? 0) / max * 100)}%` }} /></div>
      <strong>{number(average(row, w))}</strong>
    </div>)}
  </div>;
}

export function PlanejamentoClient({ data, initialUnitId }: { data: PlanningData; initialUnitId: string | null }) {
  const [unitId, setUnitId] = useState(data.units.some(u => u.id === initialUnitId) ? initialUnitId! : "all");
  const [window, setWindow] = useState<WindowWeeks>(8);
  const [tab, setTab] = useState<"products" | "ingredients" | "group">("ingredients");
  const [search, setSearch] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);
  const [selected, setSelected] = useState<SalesProduct | IngredientDemand | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const allIngredients = useMemo(() => buildIngredientDemand(data), [data]);
  const recipeKeys = useMemo(() => new Set(data.recipes.map(r => `${r.unit_id}:${r.ficha_id}`)), [data.recipes]);
  const mapped = (p: SalesProduct) => p.confirmed && p.ficha_id && recipeKeys.has(`${p.unit_id}:${p.ficha_id}`);
  const products = data.products.filter(p => unitId === "all" || p.unit_id === unitId);
  const ingredients = allIngredients.filter(p => unitId === "all" || p.unit_id === unitId);
  const missing = products.filter(p => !mapped(p)).length;
  const with86 = products.filter(p => p.days86 > 0).length;
  const names = new Map(data.units.map(u => [u.id, u.name]));
  const relevantUnits = data.units.filter(u => unitId === "all" || u.id === unitId);
  const observed = relevantUnits.reduce((sum, u) => sum + u[`days${window}`], 0);
  const expected = relevantUnits.length * window * 7;
  const query = fold(search);
  const visibleProducts = products.filter(p => fold(`${p.name} ${p.category ?? ""}`).includes(query) && (!onlyPending || !mapped(p) || p.days86 > 0 || average(p, window) == null))
    .sort((a, b) => (average(b, window) ?? -1) - (average(a, window) ?? -1));
  const visibleIngredients = ingredients.filter(p => fold(p.name).includes(query) && (!onlyPending || !p.stock || (stockAge(data.as_of, p.stock) ?? 999) > 1 || p.days86 > 0 || average(p, window) == null))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const groups = consolidateDemand(ingredients).filter(g => fold(g.name).includes(query) && (!onlyPending || g.rows.some(r => !r.stock || (stockAge(data.as_of, r.stock) ?? 999) > 1 || r.days86 > 0)))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const open = (row: SalesProduct | IngredientDemand) => { setSelected(row); dialog.current?.showModal(); };
  const selectedIngredient = selected && "item_id" in selected ? selected : null;
  const selectedProduct = selected && !("item_id" in selected) ? selected : null;
  const count = tab === "products" ? visibleProducts.length : tab === "ingredients" ? visibleIngredients.length : groups.length;

  return <section className="plan" aria-label="Planejamento de compras pelas vendas">
    <header className="plan-hero">
      <div><span className="plan-eyebrow"><span className="plan-dot" /> PLANEJAMENTO PELAS VENDAS</span>
        <h2>Da venda ao pedido.</h2>
        <p>Entenda o consumo de cada casa. Compare os períodos.<br className="plan-desktop" /> Negocie o volume do grupo.</p>
      </div>
      <div className="plan-hero-note"><ChartNoAxesCombined size={22} /><strong>4 · 8 · 12 semanas</strong>
        <span>Vendas reais · Lorean<br />Ingredientes · Fichas Everest</span>
      </div>
    </header>

    <div className="plan-scope" aria-label="Casa do planejamento">
      <button className={unitId === "all" ? "active" : ""} onClick={() => setUnitId("all")}>Todas as casas</button>
      {data.units.map(u => <button key={u.id} className={unitId === u.id ? "active" : ""} onClick={() => setUnitId(u.id)}>{u.name}</button>)}
    </div>

    <div className="plan-metrics">
      <div><span>Produtos vendidos</span><strong>{number(products.length, 0)}</strong><small>na janela de 12 semanas</small></div>
      <div><span>Convertidos em ingredientes</span><strong>{number(products.length - missing, 0)}<em> / {number(products.length, 0)}</em></strong><small>com ficha confirmada e composição</small></div>
      <div><span>Ingredientes calculados</span><strong>{number(consolidateDemand(ingredients).length, 0)}</strong><small>consumo teórico coberto pelas fichas</small></div>
      <button onClick={() => { setTab("products"); setOnlyPending(true); }}><span>Histórico de 86 · 12 semanas</span><strong>{with86}</strong><small>exigem revisão da demanda <ArrowUpRight size={12} /></small></button>
    </div>

    <div className="plan-flow" aria-label="Etapas do planejamento">
      <span><Check size={14} /> Vendas realizadas</span><ArrowRight size={14} />
      <span><Check size={14} /> Consumo pelas fichas</span><ArrowRight size={14} />
      <span className="pending">Conferir estoque e entregas</span><ArrowRight size={14} /><span className="pending">Compra líquida</span>
    </div>

    <div className="plan-controls">
      <div><strong>Qual histórico usar como referência?</strong><p>As três janelas ficam visíveis. Escolha uma para destacar o consumo de 7 dias.</p></div>
      <div className="plan-windows" aria-label="Janela de referência">{WINDOWS.map(w => <button key={w} aria-pressed={window === w} className={window === w ? "active" : ""} onClick={() => setWindow(w)}>{w}<small>semanas</small></button>)}</div>
    </div>

    <div className="plan-notice"><strong>Leitura inicial para revisão.</strong> Médias brutas por semana calendário, sem corrigir automaticamente o 86.
      {observed < expected ? ` Há ${observed} de ${expected} dias com dados na janela selecionada; dias sem dados e fechamentos precisam ser conferidos.` : " Os dias da janela selecionada têm dados de vendas."}
      {missing > 0 ? ` ${missing} produtos ainda não entram no cálculo de ingredientes.` : ""} Estoque antigo, entregas pendentes e segurança ainda impedem transformar estes volumes em pedido automático.
    </div>

    <div className="plan-board">
      <div className="plan-tabs" role="tablist" aria-label="Visão do planejamento">
        <button role="tab" aria-selected={tab === "products"} onClick={() => setTab("products")}>1. Vendas por produto</button>
        <button role="tab" aria-selected={tab === "ingredients"} onClick={() => setTab("ingredients")}>2. Insumos por casa</button>
        <button role="tab" aria-selected={tab === "group"} onClick={() => setTab("group")}><Layers3 size={15} /> 3. Consolidado</button>
      </div>
      <div className="plan-toolbar">
        <label className="plan-search"><Search size={16} /><input aria-label="Buscar produto ou ingrediente" placeholder={tab === "products" ? "Buscar prato, bebida ou categoria…" : "Buscar ingrediente…"} value={search} onChange={e => setSearch(e.target.value)} /></label>
        <label className="plan-filter"><input type="checkbox" checked={onlyPending} onChange={e => setOnlyPending(e.target.checked)} /> Somente pendências</label>
        <span>{number(count, 0)} itens</span>
      </div>
      <div className="plan-table-wrap" tabIndex={0} aria-label="Tabela de planejamento; deslize para ver todas as colunas">
        {tab === "products" ? <table className="plan-table"><thead><tr><th>Produto vendido / casa</th>{WINDOWS.map(w => <th key={w} className={w === window ? "selected" : ""}>{w} semanas<small>média / semana</small></th>)}<th>4 vs. 12 sem.</th><th>Condição da leitura</th></tr></thead>
          <tbody>{visibleProducts.map(p => <tr key={`${p.unit_id}:${p.key}`}><td><button className="plan-row-button" onClick={() => open(p)}>{p.name}</button><small>{names.get(p.unit_id)} · {p.category ?? "Sem categoria"}</small></td>{WINDOWS.map(w => <td key={w} className={w === window ? "selected" : ""}>{number(average(p, w))}</td>)}<td><Trend row={p} /></td><td>{p.days86 > 0 && <span className="plan-badge red">86 histórico · {p.days86} dias em 12 semanas</span>}<span className={`plan-badge ${mapped(p) ? "green" : "amber"}`}>{mapped(p) ? "Ficha vinculada" : "Conferir ficha"}</span></td></tr>)}</tbody>
        </table> : tab === "ingredients" ? <table className="plan-table"><thead><tr><th>Ingrediente / casa</th>{WINDOWS.map(w => <th key={w} className={w === window ? "selected" : ""}>{w} semanas<small>consumo / semana</small></th>)}<th>Último estoque<small>posição histórica</small></th><th>Comprar<small>necessidade líquida</small></th></tr></thead>
          <tbody>{visibleIngredients.map(p => <tr key={p.key}><td><button className="plan-row-button" onClick={() => open(p)}>{p.name}</button><small>{names.get(p.unit_id)} · {p.measure ?? "Unidade a confirmar"} · {p.dishes.length} produtos</small></td>{WINDOWS.map(w => <td key={w} className={w === window ? "selected" : ""}>{number(average(p, w))}</td>)}<td>{p.stock?.quantity == null ? <span className="plan-badge amber">Sem posição</span> : <>{number(p.stock.quantity)} {p.stock.measure}<small>{date(p.stock.from)}{p.stock.to !== p.stock.from ? ` a ${date(p.stock.to)}` : ""}</small></>}</td><td><span className="plan-badge amber">A confirmar</span><small>Estoque + entregas + segurança</small></td></tr>)}</tbody>
        </table> : <table className="plan-table"><thead><tr><th>Ingrediente</th>{relevantUnits.map(u => <th key={u.id}>{u.name}<small>consumo / semana</small></th>)}<th className="selected">Total do grupo<small>base: {window} semanas</small></th><th>Compra líquida</th></tr></thead>
          <tbody>{groups.map(g => <tr key={g.key}><td><strong>{g.name}</strong><small>{g.measure ?? "Unidade a confirmar"} · mesmo cadastro Everest</small></td>{relevantUnits.map(u => { const r = g.rows.find(r => r.unit_id === u.id); return <td key={u.id}>{r ? <button className="plan-row-button" onClick={() => open(r)}>{number(average(r, window))}</button> : <span className="plan-muted" title="Sem consumo mapeado; não significa consumo zero">—</span>}</td>; })}<td className="selected">{number(sumDemand(g.rows, window))} <small>{g.measure ?? "unidade a confirmar"} · soma da parte mapeada</small></td><td><span className="plan-badge amber">A confirmar</span></td></tr>)}</tbody>
        </table>}
        {count === 0 && <div className="plan-empty"><Search size={26} /><strong>Nenhum item nesta seleção.</strong><p>{products.length === 0 ? "Esta casa ainda não tem vendas disponíveis para o período." : "Ajuste a busca ou o filtro de pendências. Insumos dependem de fichas confirmadas."}</p><button onClick={() => { setSearch(""); setOnlyPending(false); }}>Limpar filtros</button></div>}
      </div>
      <footer className="plan-foot"><span>Histórico até {date(new Date(Date.parse(`${data.as_of}T12:00:00Z`) - 86400000).toISOString().slice(0, 10))} · dia atual excluído</span><span>— = sem cálculo confiável ou sem mapeamento. Janelas não devem ser somadas.</span></footer>
    </div>
    <div className="plan-next"><div><strong>O próximo passo é fechar a necessidade líquida.</strong><p>Consumo previsto + segurança − estoque utilizável − entregas confirmadas a tempo.</p></div><Link href="/compras/estoque">Conferir estoque <ArrowUpRight size={16} /></Link></div>

    <dialog className="plan-dialog" ref={dialog} onClose={() => setSelected(null)} aria-label="Detalhes do planejamento">
      <button className="plan-close" onClick={() => dialog.current?.close()} aria-label="Fechar detalhes"><X size={20} /></button>
      {selected && <><span className="plan-eyebrow">{names.get(selected.unit_id)}</span><h3>{selected.name}</h3><p>{selectedIngredient ? `Consumo teórico em ${selectedIngredient.measure ?? "unidade a confirmar"} por semana, somente das fichas confirmadas.` : "Quantidade vendida por semana calendário. Referência histórica, sem correção automática por indisponibilidade."}</p><Bars row={selected} selected={window} />
        {selected.days86 > 0 && <div className="plan-notice"><strong>Há registros de 86 associados.</strong> A média pode estar abaixo da demanda. Os registros não comprovam a duração da falta; nenhum volume foi inventado para compensá-la.</div>}
        {selectedProduct && <><h4>Média por dia da semana · {window} semanas</h4><div className="plan-dow">{weekday.map((day, i) => { const d = selectedProduct.weekdays.find(d => d.dow === i + 1); return <div key={day}><span>{day}</span><strong>{d ? number(average(d, window)) : "—"}</strong></div>; })}</div><p className="plan-muted">Primeira venda encontrada nesta janela: {date(selectedProduct.first_sale)}. Produtos novos e dias sem dados exigem revisão antes de usar a média como previsão.</p></>}
        {selectedIngredient && <><h4>Produtos que consomem este ingrediente</h4><ul>{[...new Set(selectedIngredient.dishes)].map(d => <li key={d}>{d}</li>)}</ul><div className="plan-notice"><strong>Compra ainda a confirmar.</strong> A posição de estoque é {selectedIngredient.stock ? `de ${date(selectedIngredient.stock.from)}` : "desconhecida"}. Também precisamos conciliar entregas pendentes, segurança, embalagem e rendimento para fechar o pedido.</div></>}
        <p className="plan-muted">Registros de 85/86 são associados pelo nome exato normalizado. Ausência de registro não comprova disponibilidade.</p>
      </>}
    </dialog>
  </section>;
}
