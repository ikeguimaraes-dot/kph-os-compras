"use client";
import { useAuth } from "@kph/auth/context";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  getEstoqueMinimo,
  saveEstoqueMinimo,
  type EstoqueItem,
  type EstoqueMinimoData,
} from "@/lib/compras/estoque-minimo-actions";

const STATUS_LABEL: Record<EstoqueItem["status"], string> = {
  OK: "OK",
  "85": "85",
  ZERADO: "ZERADO",
  SEM_MINIMO: "—",
};

const STATUS_COLOR: Record<EstoqueItem["status"], string> = {
  OK: "#047857",
  "85": "#b45309",
  ZERADO: "#b91c1c",
  SEM_MINIMO: "var(--muted)",
};

function EditableMin({
  item,
  unitId,
  onSaved,
}: {
  item: EstoqueItem;
  unitId: string | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(item.qtd_minima ?? ""));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function save() {
    if (!unitId) { setErr("Selecione a casa."); return; }
    const num = Number(value);
    if (isNaN(num) || num < 0) { setErr("Valor inválido."); return; }
    setSaving(true);
    setErr("");
    try {
      await saveEstoqueMinimo({ unit_id: unitId, insumo_id: item.item_id, qtd_minima: num });
      setEditing(false);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <span style={{ display: "inline-flex", gap: "0.25rem", alignItems: "center" }}>
        <input
          ref={inputRef}
          type="number"
          min="0"
          step="0.001"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          style={{ width: "5rem", padding: "0.1rem 0.25rem" }}
          disabled={saving}
        />
        <button onClick={save} disabled={saving} style={{ fontSize: "0.75em", padding: "0.15rem 0.4rem" }}>
          {saving ? "…" : "✓"}
        </button>
        <button onClick={() => setEditing(false)} style={{ fontSize: "0.75em", padding: "0.15rem 0.4rem" }}>✕</button>
        {err && <span style={{ color: "#b91c1c", fontSize: "0.75em" }}>{err}</span>}
      </span>
    );
  }

  return (
    <button
      onClick={() => { setValue(String(item.qtd_minima ?? "")); setEditing(true); }}
      title="Editar mínimo"
      style={{ background: "none", border: "1px dashed currentColor", padding: "0.15rem 0.5rem", cursor: "pointer", borderRadius: "0.2rem", color: "var(--muted)", fontSize: "0.85em" }}
    >
      {item.qtd_minima != null ? `${item.qtd_minima}` : "definir"}
    </button>
  );
}

export default function EstoqueMinimoClient() {
  const { unitId, setUnitId } = useAuth();
  const unit = unitId === "all" ? null : unitId;
  const setUnit = (id: string | null) => setUnitId(id ?? "all");

  const [data, setData] = useState<EstoqueMinimoData | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [filtro, setFiltro] = useState<"todos" | "em85">("todos");
  const [search, setSearch] = useState("");

  const requestKey = JSON.stringify([unit, revision]);
  const [previousKey, setPreviousKey] = useState(requestKey);
  if (previousKey !== requestKey) {
    setPreviousKey(requestKey);
    setData(null);
    setError("");
  }

  useEffect(() => {
    let live = true;
    getEstoqueMinimo(unit)
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [unit, revision]);

  const items = data?.items ?? [];
  const filtered = items
    .filter((i) => filtro === "em85" ? i.status === "85" || i.status === "ZERADO" : true)
    .filter((i) => search === "" || i.descricao.toLowerCase().includes(search.toLowerCase()));

  const sorted = [...filtered].sort((a, b) => {
    if (filtro === "em85") {
      // ordenar por (mínimo − atual) / mínimo desc
      const gapA = a.qtd_minima != null && a.quantidade != null ? (a.qtd_minima - a.quantidade) / a.qtd_minima : 0;
      const gapB = b.qtd_minima != null && b.quantidade != null ? (b.qtd_minima - b.quantidade) / b.qtd_minima : 0;
      return gapB - gapA;
    }
    return a.descricao.localeCompare(b.descricao, "pt-BR");
  });

  return (
    <main className="supply">
      <nav aria-label="Estoque">
        <Link href="/compras/prisma">Prisma de Compras</Link>
        <Link href="/compras/estoque">Inventários</Link>
        <Link href="/compras/estoque/minimo">Mínimos (85)</Link>
        <Link href="/compras">Pedidos</Link>
        <Link href="/compras/ingredientes">Ingredientes</Link>
      </nav>
      <header>
        <p className="eyebrow">GRUPO KPH · ESTOQUE</p>
        <h1>Estoque mínimo.</h1>
        <p>Defina os mínimos de cada insumo e acompanhe os itens em alerta.</p>
      </header>

      <label>
        Casa
        <select value={unit ?? ""} onChange={(e) => setUnit(e.target.value || null)}>
          <option value="">Todas as casas autorizadas</option>
          {data?.units.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </label>

      {error && (
        <p className="alert" role="alert">
          {error}{" "}
          <button onClick={() => setRevision((r) => r + 1)}>Recarregar</button>
        </p>
      )}

      {!data ? (
        <p role="status">Carregando estoque…</p>
      ) : (
        <>
          {/* Resumo */}
          <section className="metrics" aria-label="Resumo de estoque">
            <article>
              <small>Em 85</small>
              <strong style={{ color: "#b45309" }}>{data.resumo.em_85}</strong>
              <p>Abaixo do mínimo, acima de zero.</p>
            </article>
            <article>
              <small>Zerados</small>
              <strong style={{ color: "#b91c1c" }}>{data.resumo.zerados}</strong>
              <p>Estoque igual a zero.</p>
            </article>
            <article>
              <small>Sem mínimo</small>
              <strong>{data.resumo.sem_minimo}</strong>
              <p>Sem mínimo cadastrado.</p>
            </article>
          </section>

          {/* Filtros */}
          <div style={{ display: "flex", gap: "0.5rem", marginBlock: "1rem", flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={() => setFiltro("todos")}
              aria-pressed={filtro === "todos"}
              style={{ fontWeight: filtro === "todos" ? 700 : 400 }}
            >
              Todos ({items.length})
            </button>
            <button
              onClick={() => setFiltro("em85")}
              aria-pressed={filtro === "em85"}
              style={{ fontWeight: filtro === "em85" ? 700 : 400, color: "#b45309" }}
            >
              Em 85 ({data.resumo.em_85 + data.resumo.zerados})
            </button>
            <input
              type="search"
              placeholder="Buscar insumo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ marginLeft: "auto", padding: "0.25rem 0.5rem", minWidth: "12rem" }}
            />
          </div>

          {!unit && (
            <p className="muted" style={{ fontSize: "0.85em", marginBottom: "0.5rem" }}>
              Selecione uma casa para editar os mínimos inline.
            </p>
          )}

          {/* Tabela */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th>Unidade</th>
                  <th>Estoque atual</th>
                  <th>Mínimo</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", color: "var(--muted)" }}>
                      Nenhum item encontrado.
                    </td>
                  </tr>
                )}
                {sorted.map((item) => (
                  <tr key={item.item_id}>
                    <td>{item.descricao}</td>
                    <td>{item.unidade_medida ?? "—"}</td>
                    <td>
                      {item.quantidade != null
                        ? item.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 })
                        : "—"}
                    </td>
                    <td>
                      {unit ? (
                        <EditableMin item={item} unitId={unit} onSaved={() => setRevision((v) => v + 1)} />
                      ) : (
                        <span style={{ color: "var(--muted)" }}>
                          {item.qtd_minima != null ? item.qtd_minima.toLocaleString("pt-BR") : "—"}
                        </span>
                      )}
                    </td>
                    <td>
                      <span
                        style={{
                          color: STATUS_COLOR[item.status],
                          fontWeight: item.status !== "SEM_MINIMO" ? 700 : 400,
                          fontSize: "0.85em",
                        }}
                      >
                        {STATUS_LABEL[item.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
