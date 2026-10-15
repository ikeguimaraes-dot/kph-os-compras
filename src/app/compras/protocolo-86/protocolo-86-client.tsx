"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@kph/auth/context";
import {
  getProtocolo86Data,
  saveTeto,
  toggleAssinatura,
  type Protocolo86Data,
} from "./protocolo-86-actions";

type Classe86 = "INEGOCIAVEL" | "PROTEGIDO" | "GERENCIAVEL" | "LIVRE";

const CLASSE_LABEL: Record<Classe86, string> = {
  INEGOCIAVEL: "INEGOCIÁVEL",
  PROTEGIDO: "PROTEGIDO",
  GERENCIAVEL: "GERENCIÁVEL",
  LIVRE: "LIVRE",
};

const CLASSE_COLOR: Record<Classe86, React.CSSProperties> = {
  INEGOCIAVEL: { color: "#dc2626" },
  PROTEGIDO: { color: "#d97706" },
  GERENCIAVEL: { color: "#ca8a04" },
  LIVRE: { color: "#16a34a" },
};

const money = (n: number | null) =>
  n == null
    ? "—"
    : n.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
      });

const CLASSES: Classe86[] = ["INEGOCIAVEL", "PROTEGIDO", "GERENCIAVEL", "LIVRE"];

export default function Protocolo86Client() {
  const { unitId, setUnitId } = useAuth();
  const unit = unitId === "all" ? null : (unitId ?? null);
  const [data, setData] = useState<Protocolo86Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [searchPrato, setSearchPrato] = useState("");
  const [filtroCls, setFiltroCls] = useState<Classe86 | "">("");

  const requestKey = JSON.stringify([unit, revision]);
  const [prevKey, setPrevKey] = useState(requestKey);
  if (prevKey !== requestKey) {
    setPrevKey(requestKey);
    setData(null);
    setError("");
  }

  useEffect(() => {
    let live = true;
    getProtocolo86Data(unit)
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : "Erro ao carregar.");
      });
    return () => {
      live = false;
    };
  }, [unit, revision]);

  async function act(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(msg);
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  const abertosMap = new Map<string, number>();
  if (data) {
    const grupoPorPrato = new Map(
      data.pratos.map((p) => [p.produto_id, p.grupo]),
    );
    for (const ep of data.episodios) {
      if (!ep.aberto) continue;
      const grupo = grupoPorPrato.get(ep.produto_venda_ficha_id);
      if (grupo) abertosMap.set(grupo, (abertosMap.get(grupo) ?? 0) + 1);
    }
  }

  const pratosFiltrados = (data?.pratos ?? []).filter(
    (p) =>
      (!filtroCls || p.classe_86 === filtroCls) &&
      (p.nome ?? "").toLowerCase().includes(searchPrato.toLowerCase()),
  );

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "1.5rem 1rem" }}>
      <nav style={{ marginBottom: "1rem" }}>
        <Link href="/compras/inicio">← Início</Link>
      </nav>
      <header style={{ marginBottom: "1.5rem" }}>
        <p
          style={{
            fontSize: "0.75rem",
            opacity: 0.6,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          GRUPO KPH · COMPRAS
        </p>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0.25rem 0" }}>
          Protocolo 86
        </h1>
        <p style={{ opacity: 0.7 }}>
          Classificação de proteção dos pratos e rastreio de custo de ruptura.
        </p>
      </header>

      <label style={{ display: "block", marginBottom: "1rem" }}>
        Casa
        <select
          value={unit ?? ""}
          onChange={(e) => setUnitId(e.target.value || "all")}
          style={{ marginLeft: "0.5rem" }}
        >
          <option value="">Todas as casas</option>
        </select>
      </label>

      {error && (
        <p
          role="alert"
          style={{
            background: "#fef2f2",
            color: "#dc2626",
            padding: "0.75rem",
            borderRadius: 4,
          }}
        >
          {error}{" "}
          <button onClick={() => setRevision((r) => r + 1)}>Recarregar</button>
        </p>
      )}
      {notice && (
        <p
          role="status"
          style={{
            background: "#f0fdf4",
            color: "#16a34a",
            padding: "0.75rem",
            borderRadius: 4,
          }}
        >
          {notice}
        </p>
      )}

      {!data ? (
        <p role="status">Carregando classificação de pratos…</p>
      ) : (
        <>
          {/* ── PLACAR ─────────────────────────────────────────────── */}
          <section
            aria-label="Placar do mês"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "0.75rem",
              marginBottom: "2rem",
            }}
          >
            <article
              style={{
                padding: "1rem",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
              }}
            >
              <small style={{ opacity: 0.6, fontSize: "0.75rem" }}>
                R$ perdido no mês
              </small>
              <p
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  margin: "0.25rem 0",
                }}
              >
                {money(data.placar.rs_perdido_mes)}
              </p>
              <p style={{ fontSize: "0.75rem", opacity: 0.6 }}>
                receita_12m ÷ 52 ÷ 7 × dias em falta por episódio
              </p>
            </article>
            {CLASSES.map((cls) => (
              <article
                key={cls}
                style={{
                  padding: "1rem",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                }}
              >
                <small style={{ opacity: 0.6, fontSize: "0.75rem" }}>
                  <span style={{ ...CLASSE_COLOR[cls], fontWeight: 600 }}>
                    {CLASSE_LABEL[cls]}
                  </span>
                </small>
                <p
                  style={{
                    fontSize: "1.5rem",
                    fontWeight: 700,
                    margin: "0.25rem 0",
                  }}
                >
                  {data.placar.por_classe[cls] ?? 0}
                </p>
                <p style={{ fontSize: "0.75rem", opacity: 0.6 }}>
                  episódios no mês
                </p>
              </article>
            ))}
          </section>

          {/* ── CATEGORIAS ─────────────────────────────────────────── */}
          <section
            aria-labelledby="h-categorias"
            style={{ marginBottom: "2rem" }}
          >
            <h2
              id="h-categorias"
              style={{
                fontSize: "1rem",
                fontWeight: 700,
                marginBottom: "0.75rem",
              }}
            >
              Categorias críticas
            </h2>
            {data.categorias.length === 0 ? (
              <p style={{ opacity: 0.6 }}>
                Nenhuma categoria cadastrada para esta casa.
              </p>
            ) : (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.875rem",
                }}
              >
                <thead>
                  <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                    <th style={{ textAlign: "left", padding: "0.5rem" }}>
                      Grupo
                    </th>
                    <th style={{ textAlign: "center", padding: "0.5rem" }}>
                      Teto simultâneo
                    </th>
                    <th style={{ textAlign: "center", padding: "0.5rem" }}>
                      Em 86 agora
                    </th>
                    <th style={{ textAlign: "center", padding: "0.5rem" }}>
                      Crítica
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.categorias.map((cat) => {
                    const abertos = abertosMap.get(cat.grupo) ?? 0;
                    const estourou =
                      abertos >= cat.teto_86_simultaneo &&
                      cat.teto_86_simultaneo > 0;
                    return (
                      <tr
                        key={`${cat.unit_id}-${cat.grupo}`}
                        style={{
                          borderBottom: "1px solid #f3f4f6",
                          background: estourou ? "#fef2f2" : undefined,
                        }}
                      >
                        <td style={{ padding: "0.5rem" }}>{cat.grupo}</td>
                        <td style={{ textAlign: "center", padding: "0.5rem" }}>
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const fd = new FormData(e.currentTarget);
                              const val = Number(fd.get("teto"));
                              void act(
                                () => saveTeto(cat.unit_id, cat.grupo, val),
                                `Teto de "${cat.grupo}" salvo: ${val}`,
                              );
                            }}
                          >
                            <input
                              name="teto"
                              type="number"
                              min={0}
                              max={99}
                              defaultValue={cat.teto_86_simultaneo}
                              style={{ width: 60, textAlign: "center" }}
                              disabled={busy}
                            />
                            <button
                              type="submit"
                              disabled={busy}
                              style={{ marginLeft: 4, fontSize: "0.75rem" }}
                            >
                              ✓
                            </button>
                          </form>
                        </td>
                        <td
                          style={{
                            textAlign: "center",
                            padding: "0.5rem",
                            fontWeight: estourou ? 700 : undefined,
                            color: estourou ? "#dc2626" : undefined,
                          }}
                        >
                          {abertos}
                          {estourou && " ⚠"}
                        </td>
                        <td style={{ textAlign: "center", padding: "0.5rem" }}>
                          {cat.critica ? "✓" : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          {/* ── PRATOS ─────────────────────────────────────────────── */}
          <section
            aria-labelledby="h-pratos"
            style={{ marginBottom: "2rem" }}
          >
            <h2
              id="h-pratos"
              style={{
                fontSize: "1rem",
                fontWeight: 700,
                marginBottom: "0.75rem",
              }}
            >
              Pratos
            </h2>
            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                marginBottom: "0.75rem",
                flexWrap: "wrap",
              }}
            >
              <label>
                Buscar
                <input
                  value={searchPrato}
                  onChange={(e) => setSearchPrato(e.target.value)}
                  style={{ marginLeft: 4 }}
                  placeholder="nome do prato"
                />
              </label>
              <label>
                Classe
                <select
                  value={filtroCls}
                  onChange={(e) =>
                    setFiltroCls(e.target.value as Classe86 | "")
                  }
                  style={{ marginLeft: 4 }}
                >
                  <option value="">Todas</option>
                  {CLASSES.map((c) => (
                    <option key={c} value={c}>
                      {CLASSE_LABEL[c]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p
              style={{
                fontSize: "0.75rem",
                opacity: 0.6,
                marginBottom: "0.5rem",
              }}
            >
              {pratosFiltrados.length} pratos
            </p>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.875rem",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                  <th style={{ textAlign: "left", padding: "0.5rem" }}>
                    Prato
                  </th>
                  <th style={{ textAlign: "left", padding: "0.5rem" }}>
                    Grupo
                  </th>
                  <th style={{ textAlign: "center", padding: "0.5rem" }}>
                    Classe
                  </th>
                  <th style={{ textAlign: "right", padding: "0.5rem" }}>
                    Receita 12m
                  </th>
                  <th style={{ textAlign: "center", padding: "0.5rem" }}>
                    Assinatura
                  </th>
                </tr>
              </thead>
              <tbody>
                {pratosFiltrados.slice(0, 200).map((p) => (
                  <tr
                    key={`${p.unit_id}-${p.produto_id}`}
                    style={{ borderBottom: "1px solid #f3f4f6" }}
                  >
                    <td style={{ padding: "0.5rem" }}>
                      {p.nome ?? p.produto_id}
                    </td>
                    <td style={{ padding: "0.5rem", opacity: 0.7 }}>
                      {p.grupo ?? "—"}
                    </td>
                    <td style={{ textAlign: "center", padding: "0.5rem" }}>
                      <span
                        style={{
                          ...CLASSE_COLOR[p.classe_86 as Classe86],
                          fontWeight: 600,
                          fontSize: "0.75rem",
                        }}
                      >
                        {CLASSE_LABEL[p.classe_86 as Classe86] ?? p.classe_86}
                      </span>
                    </td>
                    <td style={{ textAlign: "right", padding: "0.5rem" }}>
                      {money(p.receita_12m)}
                    </td>
                    <td style={{ textAlign: "center", padding: "0.5rem" }}>
                      <input
                        type="checkbox"
                        checked={p.assinatura}
                        disabled={busy}
                        onChange={(e) =>
                          void act(
                            () =>
                              toggleAssinatura(
                                p.unit_id,
                                p.nome_venda_key,
                                e.target.checked,
                              ),
                            `Assinatura de "${p.nome}" ${e.target.checked ? "ativada" : "removida"}.`,
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* ── INSUMOS ────────────────────────────────────────────── */}
          <section
            aria-labelledby="h-insumos"
            style={{ marginBottom: "2rem" }}
          >
            <h2
              id="h-insumos"
              style={{
                fontSize: "1rem",
                fontWeight: 700,
                marginBottom: "0.75rem",
              }}
            >
              Insumos herdados
            </h2>
            <p
              style={{
                fontSize: "0.75rem",
                opacity: 0.6,
                marginBottom: "0.5rem",
              }}
            >
              Insumos usados por pratos INEGOCIÁVEL ou PROTEGIDO. Raio = nº de
              pratos protegidos que os usam.
            </p>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.875rem",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                  <th style={{ textAlign: "left", padding: "0.5rem" }}>
                    Insumo
                  </th>
                  <th style={{ textAlign: "center", padding: "0.5rem" }}>
                    Classe herdada
                  </th>
                  <th style={{ textAlign: "center", padding: "0.5rem" }}>
                    Raio
                  </th>
                  <th style={{ textAlign: "right", padding: "0.5rem" }}>
                    Receita protegida
                  </th>
                  <th style={{ textAlign: "center", padding: "0.5rem" }}>
                    Estoque
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.insumos.map((ins) => (
                  <tr
                    key={`${ins.unit_id}-${ins.insumo_id}`}
                    style={{ borderBottom: "1px solid #f3f4f6" }}
                  >
                    <td style={{ padding: "0.5rem" }}>{ins.nome_insumo}</td>
                    <td style={{ textAlign: "center", padding: "0.5rem" }}>
                      <span
                        style={{
                          ...CLASSE_COLOR[ins.classe_herdada as Classe86],
                          fontWeight: 600,
                          fontSize: "0.75rem",
                        }}
                      >
                        {CLASSE_LABEL[ins.classe_herdada as Classe86] ??
                          ins.classe_herdada}
                      </span>
                    </td>
                    <td style={{ textAlign: "center", padding: "0.5rem" }}>
                      {ins.n_pratos_protegidos}
                    </td>
                    <td style={{ textAlign: "right", padding: "0.5rem" }}>
                      {money(ins.receita_protegida)}
                    </td>
                    <td style={{ textAlign: "center", padding: "0.5rem" }}>
                      <Link
                        href={`/compras/estoque?item=${ins.insumo_id}`}
                        style={{ fontSize: "0.75rem" }}
                      >
                        Ver →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}
