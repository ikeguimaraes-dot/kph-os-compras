"use client";
import { useEffect, useState, useRef } from "react";
import type { RelogioItemData } from "@/lib/compras/relogio-actions";
import { getRelogioItem, saveLeadTimeForItem } from "@/lib/compras/relogio-actions";
import { upsertContagemRapida } from "@/lib/compras/pedido-sugerido-actions";

// ── Zone types and config ─────────────────────────────────────────
type Zona = "CRITICO" | "FORA_DO_PRUMO" | "PEDIR_AGORA" | "TRANQUILO";

const ZONA_CFG: Record<Zona, { label: string; color: string; bg: string }> = {
  CRITICO:       { label: "CRÍTICO",       color: "#b91c1c", bg: "#fee2e2" },
  FORA_DO_PRUMO: { label: "FORA DO PRUMO", color: "#b45309", bg: "#fef3c7" },
  PEDIR_AGORA:   { label: "PEDIR AGORA",   color: "#1d4ed8", bg: "#dbeafe" },
  TRANQUILO:     { label: "TRANQUILO",     color: "#15803d", bg: "#dcfce7" },
};

const SEG_COLORS = ["#ef4444", "#f97316", "#f59e0b", "#22c55e"] as const;

const DIAS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

function calcZona(qtd: number, minima: number, pp: number, cob: number): Zona {
  if (cob <= 1) return "CRITICO";
  if (qtd <= minima) return "FORA_DO_PRUMO";
  if (qtd <= pp) return "PEDIR_AGORA";
  return "TRANQUILO";
}

function fmt(n: number, dec = 1): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: dec });
}

function dateLabel(daysFromNow: number, today: Date): string {
  const d = new Date(today);
  d.setDate(d.getDate() + daysFromNow);
  return `${DIAS_PT[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── Fuel gauge ────────────────────────────────────────────────────
function FuelGauge({
  qtdContada,
  consumoDia,
  qtdMinima,
  pontoPedido,
}: {
  qtdContada: number;
  consumoDia: number;
  qtdMinima: number;
  pontoPedido: number;
}) {
  const maxG = Math.max(pontoPedido * 1.4, qtdContada * 1.1, 1);
  const pct = (v: number) => Math.min(100, Math.max(0, (v / maxG) * 100));

  const segs: [number, number, string][] = [
    [0, consumoDia, SEG_COLORS[0]],
    [consumoDia, qtdMinima, SEG_COLORS[1]],
    [qtdMinima, pontoPedido, SEG_COLORS[2]],
    [pontoPedido, maxG, SEG_COLORS[3]],
  ];

  const markerPct = pct(qtdContada);

  return (
    <div style={{ position: "relative", paddingBottom: 20, userSelect: "none" }}>
      <div style={{ display: "flex", height: 22, borderRadius: 11, overflow: "hidden", gap: 1 }}>
        {segs.map(([from, to, color], i) => {
          const w = Math.max(0, pct(to) - pct(from));
          if (w <= 0) return null;
          return <div key={i} style={{ flex: w, background: color, minWidth: 2 }} />;
        })}
      </div>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: `${markerPct}%`,
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div style={{ width: 2, height: 22, background: "#111827" }} />
        <div style={{ fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", color: "#374151", marginTop: 2 }}>
          {fmt(qtdContada)}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 9,
          color: "#9ca3af",
          marginTop: 2,
        }}
      >
        <span>0</span>
        <span>{fmt(pontoPedido)} pp</span>
        <span>{fmt(maxG)}</span>
      </div>
    </div>
  );
}

// ── SVG 14-day projection ─────────────────────────────────────────
function ProjectionChart({
  qtdContada,
  consumoDia,
  qtdMinima,
  pontoPedido,
  today,
}: {
  qtdContada: number;
  consumoDia: number;
  qtdMinima: number;
  pontoPedido: number;
  today: Date;
}) {
  const W = 320, H = 140;
  const ML = 36, MR = 8, MT = 12, MB = 28;
  const cW = W - ML - MR;
  const cH = H - MT - MB;
  const DAYS = 14;

  const maxY = Math.max(qtdContada, pontoPedido, qtdMinima) * 1.35 || 1;
  const xOf = (d: number) => ML + (d / DAYS) * cW;
  const yOf = (v: number) => MT + cH - (Math.min(Math.max(v, 0), maxY) / maxY) * cH;

  const bands: [number, number, string][] = [
    [0, Math.min(consumoDia, maxY), SEG_COLORS[0]],
    [consumoDia, Math.min(qtdMinima, maxY), SEG_COLORS[1]],
    [qtdMinima, Math.min(pontoPedido, maxY), SEG_COLORS[2]],
    [pontoPedido, maxY, SEG_COLORS[3]],
  ];

  const pts = Array.from({ length: DAYS + 1 }, (_, d) => {
    const v = Math.max(0, qtdContada - d * consumoDia);
    return `${xOf(d)},${yOf(v)}`;
  }).join(" ");

  const crossings: { day: number; qty: number; label: string; color: string }[] = [];
  const addCrossing = (threshold: number, color: string, label: string) => {
    if (consumoDia <= 0) return;
    const day = (qtdContada - threshold) / consumoDia;
    if (day > 0 && day <= DAYS && qtdContada > threshold) {
      crossings.push({ day, qty: threshold, label: `${label} ${dateLabel(Math.ceil(day), today)}`, color });
    }
  };
  addCrossing(pontoPedido, SEG_COLORS[2], "PP");
  addCrossing(qtdMinima, SEG_COLORS[1], "Min");
  addCrossing(0, SEG_COLORS[0], "Zero");

  const xTicks = [0, 7, 14];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W, display: "block" }}>
      {bands.map(([from, to, color], i) => {
        if (to <= from || from >= maxY) return null;
        return (
          <rect
            key={i}
            x={ML}
            y={yOf(to)}
            width={cW}
            height={yOf(from) - yOf(to)}
            fill={color}
            opacity={0.18}
          />
        );
      })}
      {[{ v: pontoPedido, color: SEG_COLORS[2] }, { v: qtdMinima, color: SEG_COLORS[1] }].map(
        ({ v, color }) =>
          v > 0 && v <= maxY ? (
            <line
              key={v}
              x1={ML}
              x2={ML + cW}
              y1={yOf(v)}
              y2={yOf(v)}
              stroke={color}
              strokeWidth={1}
              strokeDasharray="4 3"
              opacity={0.7}
            />
          ) : null
      )}
      <polyline points={pts} fill="none" stroke="#1d4ed8" strokeWidth={2} strokeLinejoin="round" />
      {crossings.map(({ day, qty, label, color }) => {
        const cx = xOf(day);
        const cy = yOf(qty);
        return (
          <g key={`${day}`}>
            <circle cx={cx} cy={cy} r={4} fill={color} />
            <text x={cx} y={cy - 8} textAnchor="middle" fontSize={9} fontWeight={700} fill={color}>
              {label}
            </text>
          </g>
        );
      })}
      {xTicks.map((d) => (
        <g key={d}>
          <line
            x1={xOf(d)}
            x2={xOf(d)}
            y1={MT + cH}
            y2={MT + cH + 4}
            stroke="#9ca3af"
            strokeWidth={1}
          />
          <text x={xOf(d)} y={H - 4} textAnchor="middle" fontSize={9} fill="#9ca3af">
            {dateLabel(d, today).split(" ")[1]}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ── Main drawer ───────────────────────────────────────────────────
export default function RelógioItemDrawer({
  itemId,
  unitId,
  onClose,
  onLeadTimeChange,
}: {
  itemId: string | null;
  unitId: string;
  onClose: () => void;
  onLeadTimeChange?: (insumo_id: string, newLeadTime: number) => void;
}) {
  const [data, setData] = useState<RelogioItemData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [leadTime, setLeadTime] = useState(3);
  const [simPct, setSimPct] = useState(0);
  const [contagemInput, setContagemInput] = useState("");
  const [contagemSaving, setContagemSaving] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  useEffect(() => {
    if (!itemId) {
      setData(null);
      setLoadError("");
      setSimPct(0);
      return;
    }
    let alive = true;
    setLoading(true);
    setLoadError("");
    setData(null);
    getRelogioItem(unitId, itemId)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setLeadTime(d?.lead_time_dias ?? 3);
        setContagemInput("");
      })
      .catch((e: unknown) => {
        if (alive) setLoadError(e instanceof Error ? e.message : "Erro ao carregar.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [itemId, unitId]);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2500);
  }

  async function handleLeadTimeRelease(val: number) {
    if (!data?.fornecedor_cnpj) return;
    const r = await saveLeadTimeForItem(unitId, data.fornecedor_cnpj, val);
    if (r.ok) {
      showToast(`Lead time atualizado para ${val} dias`);
      onLeadTimeChange?.(data.insumo_id, val);
    } else {
      showToast(`Erro: ${r.error ?? "falha ao salvar"}`);
    }
  }

  async function handleContagemSave() {
    if (!data || !contagemInput.trim()) return;
    const qtd = parseFloat(contagemInput.replace(",", "."));
    if (isNaN(qtd) || qtd < 0) return;
    setContagemSaving(true);
    try {
      await upsertContagemRapida(unitId, data.insumo_id, qtd);
      const d = await getRelogioItem(unitId, data.insumo_id);
      setData(d);
      setContagemInput("");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Erro ao salvar contagem.");
    } finally {
      setContagemSaving(false);
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const isOpen = !!itemId;

  let derived: {
    consumoDia: number;
    cobertura: number;
    pontoPedido: number;
    pedir_ate: number;
    zona: Zona;
  } | null = null;

  if (data && data.qtd_contada != null && data.tendencia_sem != null && data.tendencia_sem > 0) {
    const consumoDia = (data.tendencia_sem / 7) * (1 + simPct / 100);
    const cobertura = data.qtd_contada / consumoDia;
    const pontoPedido = data.qtd_minima + consumoDia * leadTime;
    const pedir_ate = Math.ceil(cobertura - leadTime);
    const zona = calcZona(data.qtd_contada, data.qtd_minima, pontoPedido, cobertura);
    derived = { consumoDia, cobertura, pontoPedido, pedir_ate, zona };
  }

  const panelStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    right: 0,
    width: 420,
    maxWidth: "100vw",
    height: "100vh",
    background: "#fff",
    boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
    zIndex: 1000,
    overflowY: "auto",
    padding: 24,
    transition: "transform 0.25s ease",
    transform: isOpen ? "translateX(0)" : "translateX(100%)",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  };

  return (
    <>
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            background: "rgba(0,0,0,0.25)",
            zIndex: 999,
          }}
        />
      )}

      <div style={panelStyle} role="dialog" aria-modal="true" aria-label="Relógio do Item">
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1,
                color: "#6b7280",
                textTransform: "uppercase",
              }}
            >
              Relógio do Item
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2, color: "#111827" }}>
              {data?.nome ?? (loading ? "Carregando…" : "—")}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 20,
              cursor: "pointer",
              color: "#6b7280",
              lineHeight: 1,
              padding: 4,
            }}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        {loadError && <p style={{ color: "#b91c1c", fontSize: 13 }}>{loadError}</p>}
        {loading && <p style={{ color: "#6b7280", fontSize: 13 }}>Carregando dados…</p>}

        {/* (f) No stock count form */}
        {!loading && data && data.qtd_contada == null && (
          <div
            style={{
              background: "#fef9c3",
              border: "1px solid #fde047",
              borderRadius: 10,
              padding: 16,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13, color: "#854d0e", marginBottom: 8 }}>
              Sem contagem registrada
            </div>
            <div style={{ fontSize: 12, color: "#78350f", marginBottom: 12 }}>
              Informe o estoque atual para ver o Relógio:
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="number"
                min="0"
                step="0.001"
                placeholder="0.000"
                value={contagemInput}
                onChange={(e) => setContagemInput(e.target.value)}
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  border: "1px solid #fde047",
                  borderRadius: 6,
                  fontSize: 14,
                }}
                aria-label="Estoque contado"
              />
              <span style={{ fontSize: 12, color: "#92400e" }}>{data.unidade_medida ?? ""}</span>
              <button
                onClick={handleContagemSave}
                disabled={contagemSaving || !contagemInput.trim()}
                style={{
                  padding: "6px 14px",
                  background: "#854d0e",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {contagemSaving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        )}

        {/* Main content (requires stock count) */}
        {!loading && data && data.qtd_contada != null && (
          <>
            {/* (a) 4 cards */}
            {derived && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {(
                  [
                    {
                      label: "Cobertura",
                      value: `${fmt(derived.cobertura)} dias`,
                      sub: data.unidade_medida ?? "",
                    },
                    {
                      label: "Ponto de pedido",
                      value: fmt(derived.pontoPedido),
                      sub: data.unidade_medida ?? "",
                    },
                    {
                      label: "Pedir até",
                      value: `${derived.pedir_ate} dias`,
                      sub: "a partir de hoje",
                    },
                    { label: "Zona atual", zona: derived.zona },
                  ] as Array<
                    | { label: string; value: string; sub: string; zona?: undefined }
                    | { label: string; zona: Zona; value?: undefined; sub?: undefined }
                  >
                ).map((card, i) => (
                  <div
                    key={i}
                    style={{
                      background: "#f9fafb",
                      borderRadius: 10,
                      padding: "12px 14px",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: "#6b7280",
                        textTransform: "uppercase",
                        letterSpacing: 0.6,
                      }}
                    >
                      {card.label}
                    </div>
                    {card.zona ? (
                      <span
                        style={{
                          display: "inline-block",
                          marginTop: 6,
                          fontSize: 12,
                          fontWeight: 700,
                          padding: "3px 10px",
                          borderRadius: 99,
                          color: ZONA_CFG[card.zona].color,
                          background: ZONA_CFG[card.zona].bg,
                        }}
                      >
                        {ZONA_CFG[card.zona].label}
                      </span>
                    ) : (
                      <>
                        <div
                          style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginTop: 4 }}
                        >
                          {card.value}
                        </div>
                        <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>
                          {card.sub}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* (b) Fuel gauge */}
            {derived && (
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#6b7280",
                    marginBottom: 8,
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                  }}
                >
                  Nível de estoque
                </div>
                <FuelGauge
                  qtdContada={data.qtd_contada!}
                  consumoDia={derived.consumoDia}
                  qtdMinima={data.qtd_minima}
                  pontoPedido={derived.pontoPedido}
                />
              </div>
            )}

            {/* (c) SVG projection */}
            {derived && (
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#6b7280",
                    marginBottom: 8,
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                  }}
                >
                  Projeção 14 dias
                </div>
                <ProjectionChart
                  qtdContada={data.qtd_contada!}
                  consumoDia={derived.consumoDia}
                  qtdMinima={data.qtd_minima}
                  pontoPedido={derived.pontoPedido}
                  today={today}
                />
              </div>
            )}

            {/* (d) Lead time slider */}
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                  }}
                >
                  Lead time
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
                  {leadTime} dias
                </span>
              </div>
              {data.fornecedor_cnpj ? (
                <>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={leadTime}
                    onChange={(e) => setLeadTime(Number(e.target.value))}
                    onMouseUp={(e) =>
                      void handleLeadTimeRelease(Number(e.currentTarget.value))
                    }
                    onTouchEnd={(e) =>
                      void handleLeadTimeRelease(Number(e.currentTarget.value))
                    }
                    style={{ width: "100%", accentColor: "#1d4ed8" }}
                    aria-label="Lead time em dias"
                  />
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 9,
                      color: "#9ca3af",
                    }}
                  >
                    <span>1d</span>
                    <span>10d</span>
                  </div>
                </>
              ) : (
                <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
                  Cadastre um fornecedor preferencial para editar o lead time.
                </p>
              )}
            </div>

            {/* (e) Simulation slider */}
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                  }}
                >
                  Simular consumo
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {simPct !== 0 && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 99,
                        background: "#fef3c7",
                        color: "#92400e",
                        border: "1px solid #fde68a",
                      }}
                    >
                      SIMULAÇÃO {simPct > 0 ? "+" : ""}
                      {simPct}%
                    </span>
                  )}
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
                    {simPct > 0 ? "+" : ""}
                    {simPct}%
                  </span>
                </div>
              </div>
              <input
                type="range"
                min="-50"
                max="50"
                step="5"
                value={simPct}
                onChange={(e) => setSimPct(Number(e.target.value))}
                style={{ width: "100%", accentColor: "#f59e0b" }}
                aria-label="Simulação de variação de consumo"
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 9,
                  color: "#9ca3af",
                }}
              >
                <span>−50%</span>
                <span>0</span>
                <span>+50%</span>
              </div>
            </div>

            {/* Footer info */}
            {(data.fornecedor_preferencial_nome || data.contado_em) && (
              <div
                style={{
                  fontSize: 11,
                  color: "#9ca3af",
                  borderTop: "1px solid #f3f4f6",
                  paddingTop: 12,
                }}
              >
                {data.fornecedor_preferencial_nome && (
                  <>
                    Fornecedor:{" "}
                    <strong style={{ color: "#6b7280" }}>
                      {data.fornecedor_preferencial_nome}
                    </strong>
                  </>
                )}
                {data.contado_em && (
                  <span style={{ marginLeft: 12 }}>
                    Contado em{" "}
                    {new Date(data.contado_em).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </div>
            )}
          </>
        )}

        {/* Toast */}
        {toast && (
          <div
            style={{
              position: "fixed",
              bottom: 24,
              right: 24,
              background: "#111827",
              color: "#fff",
              padding: "10px 18px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
              zIndex: 1010,
            }}
          >
            {toast}
          </div>
        )}
      </div>

      {/* Dark mode */}
      <style>{`
        @media (prefers-color-scheme: dark) {
          [role="dialog"][aria-label="Relógio do Item"] {
            background: #1f2937 !important;
            color: #f9fafb !important;
          }
        }
      `}</style>
    </>
  );
}
