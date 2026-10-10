"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPurchaseOrder } from "@/app/compras/actions";
import { getPedidoContext, getPedidoRegisteredContext } from "@/lib/compras/pedidos-actions";
import { creditState, orderTotal, saoPauloToday, suggestQuantity, WEEKDAYS,
  type PedidoContext, type PedidoItem, type PedidoSupplier } from "@/lib/compras/pedidos";
import type { Supplier } from "@/lib/compras/types";
import { formatBRL } from "@/lib/format";

type Row = { key: string; insumo_id: string; nome: string; unidade: string; quantidade: string; preco_unitario: string; fator_compra: string };
const newRow = (): Row => ({ key: crypto.randomUUID(), insumo_id: "", nome: "", unidade: "", quantidade: "", preco_unitario: "", fator_compra: "1" });
const number = (v: number | null | undefined) => v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const dateLabel = (v: string) => v.split("-").reverse().join("/");

export function NovoCompraClient({ unitId, unitName, brandId, suppliers, groups }: {
  unitId: string; unitName: string; brandId: string; suppliers: Supplier[]; groups: PedidoSupplier[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [context, setContext] = useState<PedidoContext | null>(null);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  const [dataPedido, setDataPedido] = useState(saoPauloToday);
  const [dataPrevista, setDataPrevista] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [days, setDays] = useState(7);
  const [items, setItems] = useState<Row[]>([]);
  const [confirmation, setConfirmation] = useState("");
  const manual = selection === "manual";
  const total = orderTotal(items.map((i) => ({ quantidade: Number(i.quantidade), preco_unitario: Number(i.preco_unitario) })));
  const credit = context?.credit;
  const excess = credit?.disponivel != null && total > credit.disponivel;
  const signature = JSON.stringify([selection, total, credit?.disponivel, items]);
  const color = creditState(credit?.limite_rs ?? null, credit?.em_aberto ?? 0, total);
  const valid = items.length > 0 && items.every((i) => i.nome.trim() && Number(i.quantidade) > 0 && i.preco_unitario !== "" && Number(i.preco_unitario) >= 0 && Number.isFinite(Number(i.preco_unitario)) && Number.isFinite(Number(i.quantidade)));
  const canSubmit = !pending && !loading && valid && Number.isFinite(total) && days >= 1 && days <= 90 && Number.isInteger(days)
    && (manual ? fornecedor.trim().length > 0 : !!context) && (!excess || confirmation === signature);

  async function load(value: string, reset = true) {
    const id = ++request.current;
    setSelection(value); setError(null); setConfirmation(""); setContext(null);
    if (reset) setItems([]);
    if (!value || value === "manual") { setLoading(false); return; }
    setLoading(true);
    try {
      const result = value.startsWith("supplier:")
        ? await getPedidoRegisteredContext({ unit: unitId, supplierId: value.slice(9) })
        : await getPedidoContext({ unit: unitId, root: value });
      if (request.current === id) setContext(result);
    } catch (e) { if (request.current === id) setError(e instanceof Error ? e.message : "Falha ao consultar fontes."); }
    finally { if (request.current === id) setLoading(false); }
  }
  function update(key: string, patch: Partial<Row>) {
    setItems((rows) => rows.map((r) => r.key === key ? { ...r, ...patch } : r));
    setConfirmation("");
  }
  function linkItem(key: string, id: string) {
    const item = context?.items.find((i) => i.id === id);
    update(key, { insumo_id: id, nome: item?.descricao ?? "", unidade: item?.unidade_medida ?? "", quantidade: "", fator_compra: "1" });
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const r = await createPurchaseOrder({ unit_id: unitId, brand_id: brandId,
        fornecedor: manual ? fornecedor.trim() : groups.find((g) => g.raiz_cnpj === selection)?.nome,
        supplier_id: selection.startsWith("supplier:") ? selection.slice(9) : null,
        fornecedor_grupo: credit?.raiz_cnpj ?? null, cobertura_dias: days,
        confirmar_excesso: excess && confirmation === signature, disponivel_confirmado: credit?.disponivel ?? null,
        data_pedido: dataPedido, data_prevista: dataPrevista || null, observacoes: observacoes.trim() || null,
        items: items.map((i) => ({ nome: i.nome.trim(), unidade: i.unidade || null,
          quantidade: Number(i.quantidade), preco_unitario: Number(i.preco_unitario),
          insumo_id: i.insumo_id || null, fator_compra: Number(i.fator_compra) })),
      });
      if (!r.ok) { setError(r.error); setConfirmation(""); return; }
      router.push(`/compras/${r.data.id}`); router.refresh();
    });
  }
  return <form className="prisma pedidos" onSubmit={submit}>
    <Link href="/compras">← Pedidos de compra</Link>
    <header><span className="pedido-eyebrow">GHOST · {unitName}</span><h1>Comprar com <span>contexto.</span></h1>
      <p>Estoque, consumo e compromisso financeiro na mesma decisão.</p></header>
    <fieldset disabled={pending} className="pedido-fields">
      <label>Fornecedor<select value={selection} onChange={(e) => void load(e.target.value)} required>
        <option value="">Selecionar fornecedor</option>
        <optgroup label="Everest · grupos unificados">{groups.map((g) => <option key={g.raiz_cnpj} value={g.raiz_cnpj}>{g.nome}</option>)}</optgroup>
        <optgroup label="Cadastro de compras">{suppliers.filter((s) => s.ativo).map((s) => <option key={s.id} value={`supplier:${s.id}`}>{s.nome}</option>)}</optgroup>
        <option value="manual">Fornecedor manual · sem vínculo</option>
      </select></label>
      {manual && <label>Nome do fornecedor<input value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} required /></label>}
      <label>Data do pedido<input type="date" value={dataPedido} onChange={(e) => { setDataPedido(e.target.value); setConfirmation(""); }} required /></label>
      <label>Previsão de entrega<input type="date" value={dataPrevista} onChange={(e) => setDataPrevista(e.target.value)} /></label>
      <label title="Padrão de 7 dias: não há agenda confirmada de entrega típica na base. Notas fiscais não comprovam o dia de entrega.">Cobertura alvo (dias)<input type="number" min="1" max="90" step="1" value={days} onChange={(e) => setDays(Number(e.target.value))} required /></label>
    </fieldset>
    <p className="pedido-source">Cobertura a partir da data do pedido. Padrão: 7 dias, sem agenda de entrega típica confirmada.</p>
    {loading && <p role="status">Consultando Everest, Lorean e fichas confirmadas…</p>}
    {selection && !loading && !credit && <p className="prisma-alert">Crédito e boletos sem vínculo conciliado. Nenhum saldo ou limite foi presumido.</p>}
    {credit && <section aria-label="Crédito do fornecedor" className={`pedido-finance ${color}`}>
      <div className="pedido-metrics">
        <Metric title="Boletos vencidos · grupo" value={formatBRL(credit.vencido)} source="v_mapa_titulo: Σ vl_saldo com dias_atraso > 0; todas as casas, grupo unificado." />
        <Metric title="A vencer em 7 dias · grupo" value={formatBRL(credit.a_vencer_7d)} source="v_mapa_titulo: Σ vl_saldo com vencimento entre hoje e hoje + 7 dias, inclusive." />
        <Metric title="Em aberto · grupo" value={formatBRL(credit.em_aberto)} source="v_mapa_titulo: Σ vl_saldo, títulos ativos; cada título uma única vez." />
        <Metric title="Crédito disponível" value={credit.disponivel == null ? "Sem limite" : formatBRL(credit.disponivel)} source={`compras_fornecedor_credito − títulos do mapa em todas as casas: ${credit.limite_rs == null ? "limite não cadastrado" : formatBRL(credit.limite_rs)} − ${formatBRL(credit.em_aberto)}.`} />
      </div>
      {credit.limite_rs !== null && <><progress aria-label="Crédito comprometido incluindo pedido" max={Math.max(1, credit.limite_rs)} value={Math.min(Math.max(1, credit.limite_rs), credit.em_aberto + total)} />
        <p>Limite {formatBRL(credit.limite_rs)} · em aberto + pedido {formatBRL(credit.em_aberto + total)} · {color === "red" ? "limite excedido" : color === "amber" ? "mais de 80% comprometido" : "dentro do limite"}</p></>}
      {credit.vencido > 0 && <p className="pedido-overdue" role="status">Fornecedor com {formatBRL(credit.vencido)} vencidos. <Link href={`/compras/prisma/mapa?view=dependencia&f=${encodeURIComponent(credit.raiz_cnpj)}`}>Abrir acordo</Link></p>}
      <button type="button" onClick={() => void load(selection, false)} disabled={pending || loading}>Atualizar saldos</button>
      <small>Mesma base da ficha do mapa · grupo unificado em todas as casas · consultado {context && new Date(context.readAt).toLocaleString("pt-BR")}</small>
    </section>}
    <section aria-label="Itens do pedido">
      <div className="pedido-section-head"><h2>Itens e cobertura</h2><button type="button" disabled={!selection || pending || loading} onClick={() => setItems((r) => [...r, newRow()])}>+ Adicionar item</button></div>
      {!items.length && <p className="prisma-empty">Selecione o fornecedor e adicione os itens do pedido.</p>}
      {items.map((row, idx) => {
        const item = context?.items.find((i) => i.id === row.insumo_id);
        const suggestion = item ? suggestQuantity(item, dataPedido, days, Number(row.fator_compra)) : null;
        return <article key={row.key} className="pedido-item">
          <div className="pedido-section-head"><strong>Item {idx + 1}</strong><button type="button" disabled={pending} aria-label={`Remover item ${idx + 1}`} onClick={() => { setItems((rows) => rows.filter((r) => r.key !== row.key)); setConfirmation(""); }}>Remover</button></div>
          <fieldset disabled={pending} className="pedido-fields">
            <label>Insumo Everest<select value={row.insumo_id} onChange={(e) => linkItem(row.key, e.target.value)}>
              <option value="">Item livre · sem ficha vinculada</option>{context?.items.map((i) => <option key={i.id} value={i.id}>{i.descricao}</option>)}
            </select></label>
            {!item && <label>Descrição<input value={row.nome} onChange={(e) => update(row.key, { nome: e.target.value })} required /></label>}
            <label>Unidade de compra<input value={row.unidade} onChange={(e) => update(row.key, { unidade: e.target.value })} required placeholder="kg, caixa…" /></label>
            <label title="Conteúdo informado pelo comprador. Exemplo: caixa com 12 kg → 12. Padrão 1 = compra na unidade base do insumo.">Conteúdo ({item?.unidade_medida ?? "un. base"}) por un. de compra<input type="number" min="0.000001" step="any" value={row.fator_compra} onChange={(e) => update(row.key, { fator_compra: e.target.value })} required /></label>
            <label>Quantidade<input type="number" min="0.001" step="any" value={row.quantidade} onChange={(e) => update(row.key, { quantidade: e.target.value })} required /></label>
            <label>Preço por un. de compra (R$)<input type="number" min="0" step="0.01" value={row.preco_unitario} onChange={(e) => update(row.key, { preco_unitario: e.target.value })} required /></label>
          </fieldset>
          {item ? <ItemContext item={item} /> : <p>Sem ficha vinculada · estoque e consumo não calculados.</p>}
          <div className="pedido-section-head"><div>{suggestion && <>
            <button type="button" title={suggestion.formula} disabled={suggestion.quantity === null || pending} onClick={() => update(row.key, { quantidade: String(suggestion.quantity) })}>Usar sugestão: {number(suggestion.quantity)} {row.unidade}</button>
            <details><summary>Fórmula e fontes da sugestão</summary><p>{suggestion.formula}</p></details>
          </>}</div><strong title="Quantidade × preço por unidade de compra; arredondamento em centavos.">{formatBRL(orderTotal([{ quantidade: Number(row.quantidade), preco_unitario: Number(row.preco_unitario) }]))}</strong></div>
        </article>;
      })}
    </section>
    <label className="pedido-notes">Observações<textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} maxLength={2000} rows={2} /></label>
    <section className={`pedido-total ${color}`} aria-live="polite"><span>Total do pedido</span><strong>{formatBRL(total)}</strong>
      {excess && <label className="pedido-confirm"><input type="checkbox" checked={confirmation === signature} onChange={(e) => setConfirmation(e.target.checked ? signature : "")} disabled={pending} />
        Confirmo este pedido de {formatBRL(total)}, acima do disponível de {formatBRL(credit!.disponivel!)}. Minha identidade e o horário serão registrados.</label>}
    </section>
    {error && <p role="alert" className="pedido-error">{error}</p>}
    <div className="pedido-section-head"><Link href="/compras">Cancelar</Link><button type="submit" disabled={!canSubmit}>{pending ? "Salvando…" : "Criar pedido (rascunho)"}</button></div>
  </form>;
}
function Metric({ title, value, source }: { title: string; value: string; source: string }) {
  return <div tabIndex={0} title={source}><small>{title}</small><strong>{value}</strong><details><summary>Fonte e cálculo</summary>{source}</details></div>;
}
function ItemContext({ item }: { item: PedidoItem }) {
  return <div className="pedido-context"><div>
    <strong>Estoque: {number(item.stock?.quantidade)} {item.unidade_medida}</strong>
    {item.stock ? <><p>Posição de {dateLabel(item.stock.posicao_de)}{item.stock.posicao_de !== item.stock.posicao_ate && ` a ${dateLabel(item.stock.posicao_ate)}`} · snapshot de inventário</p>
      <details><summary>Fonte e depósitos</summary><p>{item.stock.fonte} · última contagem encerrada por depósito; soma das quantidades convertidas.</p>{item.stock.posicoes.map((p, i) => <p key={i}>{p.deposito}: {number(p.quantidade)} · {dateLabel(p.dia)}</p>)}</details></>
      : <p>Sem posição Everest conhecida.</p>}
    {item.desbloqueia.length > 0 && <span className="pedido-86" title={item.desbloqueia.join(", ")}>destrava 86 · {item.desbloqueia.join(", ")}</span>}
  </div><div><strong>Consumo médio por dia · {item.unidade_medida}</strong>
    {!item.consumption.length ? <p>Sem ficha confirmada</p> : <><div className="pedido-week">{WEEKDAYS.map((day, i) => {
      const value = item.consumption.find((c) => c.dow === i + 1);
      return <div key={day} title={`Σ(média vendida × quantidade na ficha). ${value?.dias_observados ?? 0}/12 dias observados.`}><small>{day}</small><b>{number(value?.consumo_medio)}</b></div>;
    })}</div><details><summary>Média de vendas, ficha e fontes</summary><p>Lorean: soma das vendas em cada dia ÷ 12, nos últimos 84 dias completos. Apenas pontes confirmadas. Dias ausentes deixam a média indisponível.</p>
      {WEEKDAYS.map((day, i) => <div key={day}><b>{day}</b>{item.consumption.find((c) => c.dow === i + 1)?.pratos.map((p) => <p key={p.produto_id}>{p.nome}: {number(p.media_vendas)} vendas/dia × {number(p.quantidade_ficha)} na ficha = {number(p.consumo)} {item.unidade_medida}/dia.</p>)}</div>)}
    </details></>}
  </div></div>;
}
