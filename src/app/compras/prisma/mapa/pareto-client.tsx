"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getPareto, markSignature } from "@/lib/compras/prisma-pareto-actions";
import { classifyPareto, menuEconomy, paretoCoverage, paretoKey, type ParetoDish } from "@/lib/compras/prisma-pareto";

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (value: number) => `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
type Data = Awaited<ReturnType<typeof getPareto>>;
type Tab = "pratos" | "fornecedores" | "insumos";
type Row = { id: string; name: string; value: number | null; detail: string; dish?: ParetoDish; overdue?: number };
const sources = {
  pratos: "Receita atribuída 12m = soma das arestas do prato: receita Lorean × peso de custo Everest × share de quantidade do fornecedor. Fonte: v_pareto_prato. Valores incompletos permanecem sinalizados.",
  fornecedores: "Gasto 12m = soma do valor de compras válidas Everest, por raiz unificada, sem multiplicação por pratos. Fonte: v_pareto_fornecedor / v_mapa_compra. Vencido: títulos ativos com saldo, anteriores a hoje.",
  insumos: "Compra 12m = soma do valor de compras válidas Everest por item/casa, reunindo todas as raízes fornecedoras. Fonte: v_pareto_insumo / v_mapa_share.",
};
export default function ParetoClient({ unit, units }: { unit: string; units: { id: string; name: string }[] }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("pratos");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    getPareto().then(value => { if (active) setData(value); }).catch(reason => { if (active) setError(String(reason)); });
    return () => { active = false; };
  }, []);
  async function signature(dish: ParetoDish) {
    const key = paretoKey(dish.unit_id, dish.produto_id);
    setSaving(key); setError("");
    try {
      await markSignature({ unit_id: dish.unit_id, produto_id: dish.produto_id });
      setData(current => current && ({ ...current, dishes: current.dishes.map(d =>
        paretoKey(d.unit_id, d.produto_id) === key ? { ...d, assinatura: true } : d) }));
      setSelected(current => new Set([...current].filter(id => id !== key)));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível gravar assinatura."); }
    finally { setSaving(null); }
  }
  const scope = units.filter(u => !unit || u.id === unit);
  const economy = data && menuEconomy(data.dishes.filter(d => !unit || d.unit_id === unit), selected);
  return <div className="pareto">
    <div className="map-section-title"><h2>Onde se concentra o resultado.</h2><p>ABC por casa · janela de 12 meses. Os demais filtros do mapa ficam preservados ao alternar a visão.</p></div>
    <div className="pareto-tabs" role="group" aria-label="Abas do Pareto">
      {(["pratos", "fornecedores", "insumos"] as const).map(t => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t === "pratos" ? "Pratos" : t === "fornecedores" ? "Fornecedores" : "Insumos"}</button>)}
    </div>
    <p className="pareto-formula" tabIndex={0} title={sources[tab]}>{sources[tab]}</p>
    {error && <p role="alert" className="map-warning">{error}</p>}
    {!data && !error && <p role="status" className="map-empty">Consultando as curvas ABC…</p>}
    {tab === "pratos" && economy && <aside className="pareto-economy" aria-live="polite">
      <h3>Economia de cardápio · teto histórico</h3>
      <p>{economy.dishes.length} pratos C selecionados. Assinaturas e atribuições incompletas não são cortáveis.</p>
      <div><strong title="Soma da compra Everest em 12m dos itens exclusivos dos pratos C selecionados; cada item uma vez. Não considera margem, estoque ou perda de receita.">{brl(economy.purchase)}<small>compra 12m evitável</small></strong>
        <strong title="Fornecedores cujos itens comprados, na casa, servem exclusivamente um único prato confirmado selecionado. Itens sem vínculo impedem a classificação como dedicado.">{economy.suppliers}<small>fornecedores a menos</small></strong>
        <strong title="IDs de títulos não cancelados rotulados boleto, lançados em 12m nos fornecedores dedicados / 12. Média histórica; não reduz a dívida existente.">{economy.monthlyBills.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}<small>boletos/mês a menos</small></strong></div>
    </aside>}
    {data && scope.map(house => {
      const rows: Row[] = tab === "pratos" ? data.dishes.filter(d => d.unit_id === house.id).map(d => ({ id: d.produto_id, name: d.nome, value: d.receita_atribuida, dish: d,
        detail: `${d.insumos_exclusivos} insumos exclusivos · ${d.fornecedores_dedicados} fornecedores dedicados${d.atribuicao_completa ? "" : " · atribuição incompleta"}` }))
        : tab === "fornecedores" ? data.suppliers.filter(s => s.unit_id === house.id).map(s => ({ id: s.raiz_cnpj, name: s.nome, value: s.gasto_12m === null ? null : Number(s.gasto_12m), overdue: Number(s.vencido), detail: `Vencido ${brl(Number(s.vencido))} · receita atribuída ${brl(Number(s.receita_atribuida))}` }))
        : data.ingredients.filter(i => i.unit_id === house.id).map(i => ({ id: i.insumo_id, name: i.nome, value: i.compra_12m === null ? null : Number(i.compra_12m),
          detail: `${i.fornecedores} fornecedores · ${Number(i.quantidade_12m).toLocaleString("pt-BR")} ${i.unidade_medida ?? "un. do cadastro"}${Number(i.fornecedores) > 1 ? ` · Equalização: ${Number(i.volume_equalizavel).toLocaleString("pt-BR")} ${i.unidade_medida ?? "un."} para ${data.suppliers.find(s => s.unit_id === i.unit_id && s.raiz_cnpj === i.principal)?.nome ?? i.principal ?? "principal desconhecido"}` : ""}` }));
      const curve = classifyPareto(rows, r => r.value, r => r.id);
      const coverage = paretoCoverage(data.dishes.filter(d => d.unit_id === house.id));
      const width = Math.max(720, curve.bars.length * 30), height = 230, max = curve.bars[0]?.value ?? 0;
      const points = curve.bars.map((b, index) => `${45 + (index + .5) * (width - 80) / curve.bars.length},${height - 25 - (b.accumulated ?? 0) * (height - 50)}`).join(" ");
      return <section className="pareto-house" key={house.id} aria-label={`Pareto ${tab} · ${house.name}`}>
        <h3>{house.name} <span title={sources[tab]}>{curve.total > 0 ? `${brl(curve.total)} · base calculável` : "Base incompleta"}</span></h3>
        {curve.total <= 0 && <p role="status" className="map-warning">Base incompleta: não há valor calculável positivo para a curva ABC nesta casa. <Link href="/compras/fichas">confirme as fichas em /compras/fichas</Link>.</p>}
        {tab === "pratos" && <aside className="map-warning" aria-label={`Sem base · ${house.name}`}>
          <h4>Sem base · {coverage.count} pratos</h4>
          <p title="Receita Lorean 12m dos produtos sem atribuição calculável / receita Lorean 12m de todos os produtos da casa em produto_venda_ficha, incluindo pontes pendentes. Não usa CMV Lorean.">{coverage.share === null ? "Percentual indisponível: receita Lorean sem base positiva." : `${pct(coverage.share)} da receita Lorean · ${brl(coverage.unknownRevenue)} de ${brl(coverage.revenue)} em 12 meses.`}</p>
          {coverage.count > 0 && <><p><Link href="/compras/fichas">confirme as fichas em /compras/fichas</Link>. Estes pratos permanecem fora do ABC e dos cortáveis.</p>
            <details><summary>Ver os {coverage.count} pratos sem base</summary>{curve.unknown.map(r => <p key={r.id}>{r.name} · receita atribuída indisponível{r.dish?.assinatura ? " · ★ Assinatura" : ""}</p>)}</details></>}
        </aside>}
        <p title="Ordenação decrescente; a barra que cruza 80% ainda pertence a A, a que cruza 95% a B; demais C. Os percentuais realizados podem ultrapassar os cortes, mas A+B+C=100%. Base zero não recebe ABC.">
          {curve.total ? `A ${pct(curve.shares.A)} · B ${pct(curve.shares.B)} · C ${pct(curve.shares.C)}` : "Base sem valor positivo: ABC não calculável"} · cortes 80% / 95%</p>
        {curve.total > 0 && <div className="pareto-chart-scroll" tabIndex={0} aria-label="Gráfico ABC com rolagem horizontal">
          <svg viewBox={`0 0 ${width} ${height}`} style={{ width, height }} role="img" aria-label={`Barras por valor e linha acumulada de ${house.name}. Detalhes acessíveis na lista abaixo.`}>
            {[.8, .95].map(cut => <g key={cut}><path d={`M40 ${height - 25 - cut * (height - 50)} H${width - 30}`} stroke="#81917e" strokeDasharray="4 4"/><text x="2" y={height - 28 - cut * (height - 50)} fill="#ccd7c7" fontSize="10">{pct(cut)}</text></g>)}
            {curve.bars.map((b, index) => <rect key={b.key} x={45 + index * (width - 80) / curve.bars.length} y={height - 25 - (max ? b.value / max : 0) * (height - 50)} width={Math.max(2, (width - 80) / curve.bars.length - 3)} height={max ? b.value / max * (height - 50) : 0} fill={b.band === "A" ? "#89b893" : b.band === "B" ? "#dbb26f" : "#8e9690"}><title>{b.row.name}: {brl(b.value)} · {b.band ?? "Sem ABC"} · acumulado {pct(b.accumulated ?? 0)}. {sources[tab]}</title></rect>)}
            <polyline points={points} stroke="#e8e0ca" strokeWidth="2" fill="none" />
          </svg>
        </div>}
        <div className="pareto-bars">
          {curve.bars.map(b => {
            const dish = b.row.dish, key = paretoKey(house.id, b.key);
            const canCut = b.band === "C" && !!dish?.atribuicao_completa && !dish.assinatura;
            return <article className="pareto-row" key={b.key}>
              <div><span className={`pareto-class band-${b.band}`}>{b.band ?? "—"}</span><strong>{b.row.name}</strong>{dish?.assinatura && <span className="map-badge purple">★ Assinatura</span>}
                {b.band === "C" && Number(b.row.overdue) > 0 && <span className="map-badge amber">Cauda C com vencido · revisar saída</span>}</div>
              <div className="pareto-track" title={`${brl(b.value)}. ${sources[tab]}`}><span style={{ width: `${max ? b.value / max * 100 : 0}%` }} /></div>
              <p><span title={sources[tab]}>{brl(b.value)}</span> · <span title="Soma dos valores até esta barra / total da casa.">acumulado {b.accumulated === null ? "indeterminado" : pct(b.accumulated)}</span></p>
              <p title={tab === "insumos" ? "Mesmo item Everest em 2+ raízes unificadas. Equalização = volume 12m fora do principal 90d, fallback 12m. Não mistura unidades ou cadastros por semelhança de nome." : "Exclusivo: nenhum outro prato confirmado da mesma casa usa o item. Dedicado: todos os itens comprados do fornecedor são exclusivos do prato."}>{b.row.detail}</p>
              {dish && <div className="pareto-actions">{canCut && <label><input type="checkbox" checked={selected.has(key)} onChange={e => setSelected(current => { const next = new Set(current); if (e.target.checked) next.add(key); else next.delete(key); return next; })}/>Simular retirada de {dish.nome}</label>}
                {!dish.assinatura && data.editableUnits.includes(dish.unit_id) && <button disabled={saving !== null} onClick={() => signature(dish)}>{saving === key ? "Gravando…" : `Marcar assinatura · ${dish.nome}`}</button>}</div>}
            </article>;
          })}
        </div>
        {tab !== "pratos" && !!curve.unknown.length && <details open className="map-warning"><summary>Sem base · {curve.unknown.length} itens · fora do ABC</summary><p>Receita Lorean não atribuível a estes itens. <Link href="/compras/fichas">confirme as fichas em /compras/fichas</Link>.</p>{curve.unknown.map(r => <p key={r.id}>{r.name} · {r.detail}{r.dish?.assinatura ? " · ★ Assinatura" : ""}</p>)}</details>}
        {!rows.length && <p className="map-empty">Sem registros nesta casa.</p>}
      </section>;
    })}
  </div>;
}
