"use client";
import { useAuth } from "@kph/auth/context";
import { resolveUnitScope } from "@/lib/compras/unit-scope";
import { useEffect, useRef, useState } from "react";
import {
  getEstoqueMinMaxItems,
  upsertEstoqueMinMax,
  searchEverestFornecedores,
  type EstoqueMinMaxItem,
  type EverestFornecedor,
  type OrigemReposicao,
} from "@/lib/compras/estoque-minmax-actions";
import "../../../components/compras/sources.css";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Status = { label: string; color: string };

function getStatus(
  stock: number | null,
  min: number | null,
  max: number | null,
  origem: OrigemReposicao
): Status {
  if (max != null && stock != null && stock > max)
    return { label: "Acima do máx", color: "#1d6fa5" };
  if (stock == null || stock <= 0)
    return { label: "Zerado", color: "#b91c1c" };
  if (min != null && stock >= min)
    return { label: "OK", color: "#15803d" };
  if (min != null && stock > 0 && stock < min) {
    if (origem === "bloqueado") return { label: "Bloqueio", color: "#7c3aed" };
    return { label: "~85%", color: "#b45309" };
  }
  return { label: "—", color: "#6b7280" };
}

type RowState = {
  item: EstoqueMinMaxItem;
  minInput: string;
  maxInput: string;
  origemInput: OrigemReposicao;
  fornecedorId: string | null;
  fornecedorNome: string;
  fornecedorSearch: string;
  fornecedorOptions: EverestFornecedor[];
  fornecedorLoading: boolean;
  saving: boolean;
  error: string;
};

function buildRowState(item: EstoqueMinMaxItem): RowState {
  return {
    item,
    minInput: item.qtd_minima != null ? String(item.qtd_minima) : "",
    maxInput: item.qtd_maxima != null ? String(item.qtd_maxima) : "",
    origemInput: item.origem_reposicao,
    fornecedorId: item.fornecedor_preferencial_id,
    fornecedorNome: item.fornecedor_preferencial_nome ?? "",
    fornecedorSearch: item.fornecedor_preferencial_nome ?? "",
    fornecedorOptions: [],
    fornecedorLoading: false,
    saving: false,
    error: "",
  };
}

export default function EstoqueMinMaxTab({
  units,
}: {
  units: { id: string; name: string }[];
}) {
  const { unitId } = useAuth();
  const unit = resolveUnitScope(unitId, units.map((u) => u.id));

  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const searchTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!unit) return;
    let alive = true;
    setLoading(true);
    setLoadError("");
    setRows([]);
    getEstoqueMinMaxItems(unit)
      .then((items) => {
        if (alive) setRows(items.map(buildRowState));
      })
      .catch((e: unknown) => {
        if (alive)
          setLoadError(e instanceof Error ? e.message : "Falha ao carregar.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [unit]);

  if (!unit) {
    return (
      <p style={{ padding: "32px 0", color: "#6b7280" }}>
        Selecione uma casa para ver o cadastro.
      </p>
    );
  }

  const filtered = rows.filter((r) =>
    r.item.nome.toLowerCase().includes(search.toLowerCase())
  );

  async function handleSave(idx: number, rowUnit: string) {
    const row = rows[idx];
    if (!row) return;
    const minVal =
      row.minInput.trim() === "" ? null : Number(row.minInput);
    const maxVal =
      row.maxInput.trim() === "" ? null : Number(row.maxInput);

    setRows((prev) =>
      prev.map((r, i) =>
        i === idx ? { ...r, saving: true, error: "" } : r
      )
    );

    try {
      await upsertEstoqueMinMax({
        unit_id: rowUnit,
        insumo_id: row.item.insumo_id,
        qtd_minima: minVal,
        qtd_maxima: maxVal,
        origem_reposicao: row.origemInput,
        fornecedor_preferencial_id: row.fornecedorId,
      });
      setRows((prev) =>
        prev.map((r, i) => {
          if (i !== idx) return r;
          const updatedItem: EstoqueMinMaxItem = {
            ...r.item,
            qtd_minima: minVal,
            qtd_maxima: maxVal,
            origem_reposicao: r.origemInput,
            fornecedor_preferencial_id: r.fornecedorId,
            fornecedor_preferencial_nome: r.fornecedorNome || null,
          };
          return { ...r, item: updatedItem, saving: false, error: "" };
        })
      );
    } catch (e) {
      setRows((prev) =>
        prev.map((r, i) =>
          i === idx
            ? {
                ...r,
                saving: false,
                error: e instanceof Error ? e.message : "Erro ao salvar.",
              }
            : r
        )
      );
    }
  }

  function handleOrigemChange(absIdx: number, value: OrigemReposicao) {
    setRows((prev) =>
      prev.map((r, i) => (i === absIdx ? { ...r, origemInput: value } : r))
    );
    if (!unit) return;
    // Save immediately on select change — read updated row from state via callback
    setRows((prev) => {
      const row = prev[absIdx];
      if (!row) return prev;
      const minVal = row.minInput.trim() === "" ? null : Number(row.minInput);
      const maxVal = row.maxInput.trim() === "" ? null : Number(row.maxInput);
      void upsertEstoqueMinMax({
        unit_id: unit,
        insumo_id: row.item.insumo_id,
        qtd_minima: minVal,
        qtd_maxima: maxVal,
        origem_reposicao: value,
        fornecedor_preferencial_id: row.fornecedorId,
      }).then(() => {
        setRows((p) =>
          p.map((r, i) => {
            if (i !== absIdx) return r;
            return {
              ...r,
              item: { ...r.item, origem_reposicao: value },
              saving: false,
              error: "",
            };
          })
        );
      }).catch((e: unknown) => {
        setRows((p) =>
          p.map((r, i) =>
            i === absIdx
              ? { ...r, saving: false, error: e instanceof Error ? e.message : "Erro ao salvar origem." }
              : r
          )
        );
      });
      return prev.map((r, i) =>
        i === absIdx ? { ...r, saving: true, error: "" } : r
      );
    });
  }

  function handleFornecedorSearch(absIdx: number, q: string) {
    setRows((prev) =>
      prev.map((r, i) =>
        i === absIdx
          ? { ...r, fornecedorSearch: q, fornecedorId: null, fornecedorNome: "" }
          : r
      )
    );
    const existing = searchTimers.current.get(absIdx);
    if (existing) clearTimeout(existing);
    if (!q.trim() || !unit) return;
    const timer = setTimeout(async () => {
      setRows((prev) =>
        prev.map((r, i) => (i === absIdx ? { ...r, fornecedorLoading: true } : r))
      );
      try {
        const options = await searchEverestFornecedores(unit, q);
        setRows((prev) =>
          prev.map((r, i) =>
            i === absIdx ? { ...r, fornecedorOptions: options, fornecedorLoading: false } : r
          )
        );
      } catch {
        setRows((prev) =>
          prev.map((r, i) => (i === absIdx ? { ...r, fornecedorLoading: false } : r))
        );
      }
    }, 350);
    searchTimers.current.set(absIdx, timer);
  }

  function handleFornecedorSelect(absIdx: number, forn: EverestFornecedor) {
    setRows((prev) =>
      prev.map((r, i) =>
        i === absIdx
          ? {
              ...r,
              fornecedorId: forn.id,
              fornecedorNome: forn.nome,
              fornecedorSearch: forn.nome,
              fornecedorOptions: [],
            }
          : r
      )
    );
    if (!unit) return;
    void handleSave(absIdx, unit);
  }

  function handleFornecedorClear(absIdx: number) {
    setRows((prev) =>
      prev.map((r, i) =>
        i === absIdx
          ? {
              ...r,
              fornecedorId: null,
              fornecedorNome: "",
              fornecedorSearch: "",
              fornecedorOptions: [],
            }
          : r
      )
    );
    if (!unit) return;
    void handleSave(absIdx, unit);
  }

  return (
    <div>
      <div className="source-filters">
        <label>
          Buscar item
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar por nome"
          />
        </label>
      </div>

      {loadError && <p role="alert">{loadError}</p>}

      {loading ? (
        <p role="status">Carregando itens…</p>
      ) : (
        <>
          <p>{filtered.length} itens</p>
          <div className="source-scroll">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Unidade</th>
                  <th>Estoque atual</th>
                  <th>Mínimo</th>
                  <th>Máximo</th>
                  <th>Status</th>
                  <th>Origem</th>
                  <th>Fornecedor pref.</th>
                  <th>Compra 12m</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const absIdx = rows.indexOf(row);
                  const status = getStatus(
                    row.item.estoque_atual,
                    row.item.qtd_minima,
                    row.item.qtd_maxima,
                    row.origemInput
                  );

                  const commitSave = () => {
                    if (!unit) return;
                    void handleSave(absIdx, unit);
                  };

                  return (
                    <tr key={row.item.insumo_id}>
                      <td>
                        <span style={{ fontWeight: 500 }}>{row.item.nome}</span>
                        {row.error && (
                          <span
                            style={{
                              display: "block",
                              fontSize: 11,
                              color: "#b91c1c",
                              marginTop: 4,
                            }}
                          >
                            {row.error}
                          </span>
                        )}
                      </td>
                      <td>{row.item.unidade_medida ?? "—"}</td>
                      <td>
                        {row.item.estoque_atual != null
                          ? row.item.estoque_atual.toLocaleString("pt-BR")
                          : "—"}
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={row.minInput}
                          disabled={row.saving}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((r, j) =>
                                j === absIdx
                                  ? { ...r, minInput: e.target.value }
                                  : r
                              )
                            )
                          }
                          onBlur={commitSave}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitSave();
                          }}
                          style={{ width: 80, minHeight: 36, padding: "4px 8px" }}
                          aria-label={`Mínimo para ${row.item.nome}`}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={row.maxInput}
                          disabled={row.saving}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((r, j) =>
                                j === absIdx
                                  ? { ...r, maxInput: e.target.value }
                                  : r
                              )
                            )
                          }
                          onBlur={commitSave}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitSave();
                          }}
                          style={{ width: 80, minHeight: 36, padding: "4px 8px" }}
                          aria-label={`Máximo para ${row.item.nome}`}
                        />
                      </td>
                      <td>
                        {row.saving ? (
                          <span style={{ fontSize: 11, color: "#6b7280" }}>
                            Salvando…
                          </span>
                        ) : (
                          <span
                            style={{
                              fontWeight: 600,
                              color: status.color,
                              fontSize: 12,
                            }}
                          >
                            {status.label}
                          </span>
                        )}
                      </td>
                      <td>
                        <select
                          value={row.origemInput}
                          disabled={row.saving}
                          onChange={(e) =>
                            handleOrigemChange(absIdx, e.target.value as OrigemReposicao)
                          }
                          style={{ minHeight: 36, padding: "4px 6px", fontSize: 12 }}
                          aria-label={`Origem para ${row.item.nome}`}
                        >
                          <option value="compra">Compra</option>
                          <option value="transferencia">Transferência</option>
                          <option value="producao">Produção</option>
                          <option value="bloqueado">Bloqueado</option>
                        </select>
                      </td>
                      <td style={{ minWidth: 180, position: "relative" }}>
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <input
                            type="text"
                            value={row.fornecedorSearch}
                            disabled={row.saving}
                            placeholder="Buscar fornecedor…"
                            onChange={(e) =>
                              handleFornecedorSearch(absIdx, e.target.value)
                            }
                            style={{
                              flex: 1,
                              minHeight: 36,
                              padding: "4px 8px",
                              fontSize: 12,
                            }}
                            aria-label={`Fornecedor preferencial para ${row.item.nome}`}
                          />
                          {row.fornecedorId && (
                            <button
                              type="button"
                              onClick={() => handleFornecedorClear(absIdx)}
                              style={{
                                padding: "2px 6px",
                                fontSize: 11,
                                background: "none",
                                border: "1px solid #e5e7eb",
                                borderRadius: 4,
                                cursor: "pointer",
                              }}
                              aria-label="Remover fornecedor preferencial"
                            >
                              ×
                            </button>
                          )}
                        </div>
                        {row.fornecedorLoading && (
                          <span style={{ fontSize: 11, color: "#6b7280" }}>
                            Buscando…
                          </span>
                        )}
                        {row.fornecedorOptions.length > 0 && (
                          <ul
                            style={{
                              position: "absolute",
                              zIndex: 10,
                              background: "white",
                              border: "1px solid #e5e7eb",
                              borderRadius: 6,
                              padding: "4px 0",
                              margin: 0,
                              listStyle: "none",
                              width: "100%",
                              maxHeight: 200,
                              overflowY: "auto",
                              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                            }}
                          >
                            {row.fornecedorOptions.map((f) => (
                              <li key={f.id}>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleFornecedorSelect(absIdx, f)
                                  }
                                  style={{
                                    width: "100%",
                                    textAlign: "left",
                                    padding: "6px 12px",
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    fontSize: 12,
                                  }}
                                >
                                  <strong>{f.nome}</strong>
                                  <span
                                    style={{ color: "#6b7280", marginLeft: 6 }}
                                  >
                                    {f.cpf_cnpj}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td>
                        <span style={{ fontSize: 12, color: "#6b7280" }}>
                          {brl(row.item.compra_12m)}/ano
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && !loading && (
              <p>Nenhum item encontrado.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
