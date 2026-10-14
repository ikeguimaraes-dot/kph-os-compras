"use client";
import { useState, useCallback, useRef } from "react";
import type { PedidoSugerido, TendenciaItem } from "@/lib/compras/pedido-sugerido-actions";
import { upsertContagemRapida } from "@/lib/compras/pedido-sugerido-actions";

const fmt = (n: number, dec = 2) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: dec });

function VariacaoCell({ pct }: { pct: number | null }) {
  if (pct == null) return <span style={{ color: "#9ca3af" }}>—</span>;
  const up = pct > 0;
  const neutral = Math.abs(pct) < 1;
  const arrow = neutral ? "→" : up ? "↑" : "↓";
  const color = neutral ? "#6b7280" : up ? "#b91c1c" : "#15803d";
  return (
    <span style={{ color, fontWeight: 600, fontSize: 12 }}>
      {arrow} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function GrupoTable({
  itens,
  contagens,
  onContagem,
  unitId,
}: {
  itens: TendenciaItem[];
  contagens: Map<string, number>;
  onContagem: (insumo_id: string, qtd: number, unitId: string) => void;
  unitId: string;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
            {(
              [
                ["Item", "left", 240],
                ["Tendência/sem", "right", 110],
                ["Variação", "right", 90],
                ["Estoque contado", "right", 130],
                ["Sugestão/sem", "right", 110],
              ] as [string, "left" | "right", number][]
            ).map(([label, align, w]) => (
              <th
                key={label}
                style={{
                  textAlign: align,
                  padding: "7px 12px",
                  color: "#6b7280",
                  fontWeight: 600,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                  minWidth: w,
                }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => {
            const contado = contagens.has(item.insumo_id)
              ? contagens.get(item.insumo_id)!
              : (item.estoque_contado ?? null);
            const ajustada = contado != null
              ? Math.max(0, item.sugestao_sem - contado)
              : item.sugestao_sem;
            return (
              <tr key={item.insumo_id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "10px 12px" }}>
                  <span style={{ fontWeight: 500 }}>{item.nome}</span>
                  {item.unidade_medida && (
                    <span style={{ display: "block", fontSize: 11, color: "#9ca3af" }}>
                      {item.unidade_medida}
                    </span>
                  )}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right", color: "#374151" }}>
                  {fmt(item.tendencia_sem, 2)}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right" }}>
                  <VariacaoCell pct={item.variacao_pct} />
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right" }}>
                  <EstoqueInput
                    value={contagens.has(item.insumo_id) ? contagens.get(item.insumo_id)! : (item.estoque_contado ?? undefined)}
                    onChange={(v) => onContagem(item.insumo_id, v, unitId)}
                  />
                  {item.contado_em && !contagens.has(item.insumo_id) && (
                    <span style={{ display: "block", fontSize: 10, color: "#9ca3af" }}>
                      {new Date(item.contado_em).toLocaleDateString("pt-BR", {
                        day: "2-digit", month: "2-digit",
                      })}
                    </span>
                  )}
                </td>
                <td
                  style={{
                    padding: "10px 12px",
                    textAlign: "right",
                    fontWeight: 700,
                    color: ajustada === 0 ? "#15803d" : "#1d4ed8",
                    fontSize: 14,
                  }}
                >
                  {fmt(ajustada, 2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EstoqueInput({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  const [local, setLocal] = useState(value != null ? String(value) : "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (raw: string) => {
    setLocal(raw);
    if (timer.current) clearTimeout(timer.current);
    const n = parseFloat(raw.replace(",", "."));
    if (!isNaN(n) && n >= 0) {
      timer.current = setTimeout(() => onChange(n), 600);
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={local}
      placeholder="0"
      onChange={(e) => handleChange(e.target.value)}
      style={{
        width: 72,
        textAlign: "right",
        fontSize: 13,
        padding: "4px 6px",
        border: "1px solid #d1d5db",
        borderRadius: 4,
        background: local !== "" ? "#fffbeb" : "white",
        outline: "none",
      }}
    />
  );
}

export function PedidoSugeridoClient({
  pedido,
  unitId,
}: {
  pedido: PedidoSugerido;
  unitId: string;
}) {
  const [contagens, setContagens] = useState<Map<string, number>>(new Map());
  const [saving, setSaving] = useState<Set<string>>(new Set());

  const handleContagem = useCallback(
    async (insumo_id: string, qtd: number, uid: string) => {
      setContagens((prev) => new Map(prev).set(insumo_id, qtd));
      setSaving((prev) => new Set(prev).add(insumo_id));
      try {
        await upsertContagemRapida(uid, insumo_id, qtd);
      } finally {
        setSaving((prev) => {
          const next = new Set(prev);
          next.delete(insumo_id);
          return next;
        });
      }
    },
    []
  );

  if (pedido.grupos.length === 0) {
    return (
      <section style={{ marginBottom: 40 }}>
        <SectionHeader title="PEDIDO SUGERIDO DO MÊS" count={0} />
        <p style={{ color: "#6b7280", fontSize: 13, padding: "12px 0" }}>
          Nenhum item com tendência de consumo calculada. Configure mínimo/máximo em Estoque Mín/Máx.
        </p>
      </section>
    );
  }

  const totalItens = pedido.grupos.reduce((s, g) => s + g.itens.length, 0);

  return (
    <section style={{ marginBottom: 48 }}>
      <SectionHeader title="PEDIDO SUGERIDO DO MÊS" count={totalItens} />

      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        {pedido.grupos.map((grupo) => (
          <div key={grupo.fornecedor_id ?? grupo.fornecedor_nome}>
            {/* Supplier header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
                paddingBottom: 6,
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: grupo.fornecedor_id ? "#1d4ed8" : "#6b7280",
                  letterSpacing: -0.1,
                }}
              >
                {grupo.fornecedor_nome}
              </span>
              <span style={{ fontSize: 11, color: "#9ca3af" }}>
                · {grupo.itens.length} {grupo.itens.length === 1 ? "item" : "itens"}
              </span>
            </div>

            <GrupoTable
              itens={grupo.itens}
              contagens={contagens}
              onContagem={handleContagem}
              unitId={unitId}
            />
          </div>
        ))}
      </div>

      <RefreshFooter ultimoRefresh={pedido.ultimo_refresh} saving={saving.size > 0} />
    </section>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, letterSpacing: -0.2 }}>
        {title}
        {count > 0 && (
          <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: "#6b7280" }}>
            ({count} {count === 1 ? "item" : "itens"})
          </span>
        )}
      </h2>
    </div>
  );
}

function RefreshFooter({ ultimoRefresh, saving }: { ultimoRefresh: string | null; saving: boolean }) {
  return (
    <div
      style={{
        marginTop: 20,
        paddingTop: 12,
        borderTop: "1px solid #f3f4f6",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontSize: 11, color: "#9ca3af" }}>
        {ultimoRefresh
          ? `Tendência calculada em ${new Date(ultimoRefresh).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}`
          : "Tendência ainda não calculada."}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.8,
          padding: "2px 8px",
          borderRadius: 99,
          color: "#1d6fa5",
          background: "#dbeafe",
          textTransform: "uppercase",
        }}
      >
        Atualiza todo dia 1º
      </span>
      {saving && (
        <span style={{ fontSize: 11, color: "#9ca3af" }}>Salvando contagem…</span>
      )}
    </div>
  );
}
