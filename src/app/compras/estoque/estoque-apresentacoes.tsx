"use client";
import { useEffect, useState } from "react";
import { contarEstoqueApresentacao, getEstoqueApresentacoes, type EstoqueApresentacao } from "@/lib/compras/estoque-apresentacoes-actions";
import { getStockStatus } from "@/lib/compras/stock-status";

function Contagem({ item, unitId, onSaved }: { item: EstoqueApresentacao; unitId: string; onSaved: (item: EstoqueApresentacao) => void }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    const saldo = Number(value.replace(",", "."));
    if (!value.trim() || !Number.isFinite(saldo) || saldo < 0) { setError("Informe uma contagem válida, inclusive zero."); return; }
    setSaving(true); setError("");
    try { onSaved(await contarEstoqueApresentacao({ unitId, id: item.id, saldo, expectedUpdatedAt: item.atualizado_em })); setValue(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Falha ao registrar contagem."); }
    finally { setSaving(false); }
  }
  return <div>
    <input aria-label={`Contagem de embalagens de ${item.nome}`} inputMode="decimal" value={value} disabled={saving} onChange={e => setValue(e.target.value)} placeholder="Embalagens contadas" style={{ width: 160 }} />
    <button type="button" disabled={saving || !value.trim()} onClick={() => void save()}>{saving ? "Salvando…" : "Registrar contagem"}</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
export default function EstoqueApresentacoes({ unitId }: { unitId: string }) {
  const [items, setItems] = useState<EstoqueApresentacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    getEstoqueApresentacoes(unitId).then(data => { if (alive) setItems(data); })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : "Falha ao carregar apresentações."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [unitId]);
  const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  if (loading) return <p role="status">Carregando apresentações…</p>;
  if (error) return <p role="alert">{error}</p>;
  if (!items.length) return null;
  return <section aria-label="Estoque por apresentação" style={{ margin: "20px 0" }}>
    <h2>Estoque por apresentação</h2>
    <p>Conte cada embalagem separadamente. “A contar” significa saldo desconhecido. O saldo agregado não é distribuído entre apresentações.</p>
    <div className="source-scroll"><table><thead><tr><th>Apresentação</th><th>Mínimo</th><th>Saldo</th><th>Status</th><th>Última contagem</th><th>Registrar contagem física</th></tr></thead>
      <tbody>{items.map(item => {
        const status = getStockStatus(item.saldo_unidades, item.minimo_unidades, null);
        return <tr key={item.id}>
          <td>{item.nome}</td>
          <td>{fmt(item.minimo_unidades)} embalagens<br /><small>{fmt(item.minimo_unidades * item.fator_base)} {item.unidade_base}</small></td>
          <td>{item.saldo_unidades == null ? "A contar" : `${fmt(item.saldo_unidades)} embalagens`}</td>
          <td style={{ color: status.color }}>{status.label}</td>
          <td>{item.contado_em ? new Date(item.contado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Não registrada"}</td>
          <td><Contagem item={item} unitId={unitId} onSaved={updated => setItems(prev => prev.map(row => row.id === updated.id ? updated : row))} /></td>
        </tr>;
      })}</tbody></table></div>
  </section>;
}
