"use client";
import { useAuth } from "@kph/auth/context";
import Link from "next/link";
import { useEffect, useState } from "react";
import { get86Timeline, dar86Baixa, type Episodio86, type TimelineData } from "@/lib/compras/timeline-actions";

const fmt = (iso: string | null | undefined, opts?: Intl.DateTimeFormatOptions) => {
  if (!iso) return null;
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...opts,
  });
};

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }) : null;

const money = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function isAberto(e: Episodio86) {
  return !e.saida_at;
}

function isNovo24h(e: Episodio86, now: Date) {
  return now.getTime() - new Date(e.entrada_at).getTime() < 24 * 3600 * 1000;
}

function isSaiu24h(e: Episodio86, now: Date) {
  return e.saida_at != null && now.getTime() - new Date(e.saida_at).getTime() < 24 * 3600 * 1000;
}

export default function TimelineClient() {
  const { unitId, setUnitId } = useAuth();
  const unit = unitId === "all" ? null : unitId;
  const setUnit = (id: string | null) => setUnitId(id ?? "all");

  const [data, setData] = useState<TimelineData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [filtro, setFiltro] = useState<"todos" | "abertos">("abertos");

  const requestKey = JSON.stringify([unit, revision]);
  const [previousKey, setPreviousKey] = useState(requestKey);
  if (previousKey !== requestKey) {
    setPreviousKey(requestKey);
    setData(null);
    setError("");
  }

  useEffect(() => {
    let live = true;
    get86Timeline(unit)
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [unit, revision]);

  async function baixa(e: Episodio86) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await dar86Baixa({ abastecimento_id: e.primeiro_abastecimento_id, unit_id: e.unit_id });
      setNotice(`Baixa registrada para ${e.produto_nome ?? "produto"}.`);
      setRevision((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao dar baixa.");
    } finally {
      setBusy(false);
    }
  }

  const now = new Date();
  const episodios = data?.episodios ?? [];

  const abertos = episodios.filter(isAberto);
  const entraram24h = episodios.filter((e) => isNovo24h(e, now));
  const sairam24h = episodios.filter((e) => isSaiu24h(e, now));
  const maisAntigo = abertos.reduce<Episodio86 | null>(
    (prev, e) => (!prev || e.entrada_at < prev.entrada_at ? e : prev),
    null,
  );

  const lista = filtro === "abertos" ? abertos : episodios;
  const sorted = [...lista].sort((a, b) => {
    const aAberto = isAberto(a) ? 0 : 1;
    const bAberto = isAberto(b) ? 0 : 1;
    if (aAberto !== bAberto) return aAberto - bAberto;
    return b.receita_semana - a.receita_semana;
  });

  return (
    <main className="supply">
      <nav aria-label="Abastecimento">
        <Link href="/compras/prisma">← Prisma</Link>
        {[
          ["/compras/abastecimento", "Rotina"],
          ["/compras/abastecimento/timeline", "Linha do tempo 86"],
          ["/compras/prisma/mapa", "Mapa de dependências"],
          ["/compras/abastecimento/acordos", "Acordos"],
          ["/compras/abastecimento/cardapio", "Papel na marca"],
          ["/compras/abastecimento/matriz", "Matriz e cotações"],
          ["/compras/fichas", "Revisar fichas"],
        ].map(([href, label]) => (
          <a key={href} href={href}>{label}</a>
        ))}
      </nav>
      <header>
        <p className="eyebrow">GRUPO KPH · COMPRAS</p>
        <h1>Linha do tempo 86.</h1>
        <p>Quando cada produto entrou e saiu do 86. Histórico de episódios por casa.</p>
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
      {notice && <p role="status" className="notice">{notice}</p>}
      {!data ? (
        <p role="status">Carregando episódios…</p>
      ) : (
        <>
          {/* Resumo */}
          <section className="metrics" aria-label="Resumo de episódios">
            <article>
              <small>Abertos agora</small>
              <strong>{abertos.length}</strong>
              <p>Episódios sem saída registrada.</p>
            </article>
            <article>
              <small>Entraram 24h</small>
              <strong>{entraram24h.length}</strong>
              <p>Novos episódios nas últimas 24h.</p>
            </article>
            <article>
              <small>Saíram 24h</small>
              <strong>{sairam24h.length}</strong>
              <p>Episódios resolvidos nas últimas 24h.</p>
            </article>
            <article>
              <small>Mais antigo aberto</small>
              <strong>
                {maisAntigo ? `${maisAntigo.dias_em_86}d — ${maisAntigo.produto_nome ?? "—"}` : "—"}
              </strong>
              <p>Maior tempo em 86 sem resolução.</p>
            </article>
          </section>

          {/* Filtros */}
          <div style={{ display: "flex", gap: "0.5rem", marginBlock: "1rem", flexWrap: "wrap" }}>
            <button
              onClick={() => setFiltro("abertos")}
              aria-pressed={filtro === "abertos"}
              style={{ fontWeight: filtro === "abertos" ? 700 : 400 }}
            >
              Em aberto ({abertos.length})
            </button>
            <button
              onClick={() => setFiltro("todos")}
              aria-pressed={filtro === "todos"}
              style={{ fontWeight: filtro === "todos" ? 700 : 400 }}
            >
              Todos ({episodios.length})
            </button>
          </div>

          {/* Tabela de episódios */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Casa</th>
                  <th>Entrou</th>
                  <th>Saiu</th>
                  <th>Dias</th>
                  <th>Registros</th>
                  <th>Motivo</th>
                  <th>Receita/sem</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", color: "var(--muted)" }}>
                      Nenhum episódio encontrado.
                    </td>
                  </tr>
                )}
                {sorted.map((ep) => {
                  const aberto = isAberto(ep);
                  const novo = isNovo24h(ep, now);
                  const velho = aberto && ep.dias_em_86 > 7;
                  return (
                    <tr
                      key={`${ep.unit_id}-${ep.produto_id}-${ep.ep_num}`}
                      style={velho ? { background: "var(--alert-bg, #fff0f0)" } : undefined}
                    >
                      <td>
                        {ep.produto_nome ?? "—"}
                        {novo && (
                          <span
                            style={{
                              marginLeft: "0.4rem",
                              background: "#d1fae5",
                              color: "#065f46",
                              fontSize: "0.65rem",
                              padding: "0.1rem 0.4rem",
                              borderRadius: "0.25rem",
                              fontWeight: 700,
                              textTransform: "uppercase",
                            }}
                          >
                            NOVO
                          </span>
                        )}
                      </td>
                      <td>{ep.casa_nome ?? "—"}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {fmt(ep.entrada_at) ?? fmtDate(ep.entrada_data) ?? "—"}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {aberto ? (
                          <span style={{ color: velho ? "#b91c1c" : "var(--muted)", fontWeight: velho ? 700 : 400 }}>
                            ABERTO · {ep.dias_em_86}d
                          </span>
                        ) : ep.saida_tipo === "voltou_a_vender" ? (
                          <>
                            <span style={{ color: "#047857", fontWeight: 600 }}>voltou a vender</span>
                            {" "}
                            {fmtDate(ep.saida_at)}
                          </>
                        ) : (
                          <>
                            <span style={{ color: "#6b7280" }}>baixa manual</span>
                            {" "}
                            {fmtDate(ep.saida_at)}
                          </>
                        )}
                      </td>
                      <td>{ep.dias_em_86}</td>
                      <td>{ep.num_registros}</td>
                      <td style={{ maxWidth: "12rem", fontSize: "0.85em", color: "var(--muted)" }}>
                        {[ep.tipo, ep.causa].filter(Boolean).join(" · ").replaceAll("_", " ") || "—"}
                      </td>
                      <td>{ep.receita_semana > 0 ? money(ep.receita_semana) : "—"}</td>
                      <td>
                        {aberto && (
                          <button
                            disabled={busy}
                            onClick={() => baixa(ep)}
                            style={{ fontSize: "0.8em", padding: "0.2rem 0.6rem" }}
                          >
                            Dar baixa
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
