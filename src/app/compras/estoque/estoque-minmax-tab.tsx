"use client";
import { useAuth } from "@kph/auth/context";
import { resolveUnitScope } from "@/lib/compras/unit-scope";
import { useEffect, useState } from "react";
import {
  getEstoqueMinMaxItems,
  upsertEstoqueMinMax,
  type EstoqueMinMaxItem,
} from "@/lib/compras/estoque-minmax-actions";
import "../../../components/compras/sources.css";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Status = {
  label: string;
  color: string;
};

function getStatus(
  stock: number | null,
  min: number | null,
  max: number | null
): Status {
  if (max != null && stock != null && stock > max)
    return { label: "Acima do máx", color: "#1d6fa5" };
  if (stock == null || stock <= 0)
    return { label: "Zerado", color: "#b91c1c" };
  if (min != null && stock >= min)
    return { label: "OK", color: "#15803d" };
  if (min != null && stock > 0 && stock < min)
    return { label: "~85%", color: "#b45309" };
  return { label: "—", color: "#6b7280" };
}

type RowState = {
  item: EstoqueMinMaxItem;
  minInput: string;
  maxInput: string;
  saving: boolean;
  error: string;
};

function buildRowState(item: EstoqueMinMaxItem): RowState {
  return {
    item,
    minInput: item.qtd_minima != null ? String(item.qtd_minima) : "",
    maxInput: item.qtd_maxima != null ? String(item.qtd_maxima) : "",
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
      });
      setRows((prev) =>
        prev.map((r, i) => {
          if (i !== idx) return r;
          const updatedItem: EstoqueMinMaxItem = {
            ...r.item,
            qtd_minima: minVal,
            qtd_maxima: maxVal,
          };
          return {
            ...r,
            item: updatedItem,
            saving: false,
            error: "",
          };
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
                  <th>Compra 12m</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  // Find the absolute index in the full rows array for saving
                  const absIdx = rows.indexOf(row);
                  const status = getStatus(
                    row.item.estoque_atual,
                    row.item.qtd_minima,
                    row.item.qtd_maxima
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
