"use client";
import { useState } from "react";
import Link from "next/link";
import type { SugestoesReposicao, SugestaoItem } from "@/lib/compras/pedidos-sugestoes-actions";
import RelógioItemDrawer from "@/app/compras/relogio-item-drawer";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ORIGEM_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  transferencia: { label: "Transferência", color: "#1d6fa5", bg: "#dbeafe" },
  producao: { label: "Produção", color: "#15803d", bg: "#dcfce7" },
};

function Badge({ origem }: { origem: string }) {
  const b = ORIGEM_BADGE[origem];
  if (!b) return null;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.8,
        padding: "2px 8px",
        borderRadius: 99,
        color: b.color,
        background: b.bg,
        textTransform: "uppercase",
      }}
    >
      {b.label}
    </span>
  );
}

function SugestaoTable({
  items,
  showValor,
  onItemClick,
}: {
  items: SugestaoItem[];
  showValor: boolean;
  onItemClick: (insumo_id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <p style={{ color: "#6b7280", fontSize: 13, padding: "12px 0" }}>
        Nenhum item nesta lista.
      </p>
    );
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
            <th
              style={{
                textAlign: "left",
                padding: "8px 12px",
                color: "#6b7280",
                fontWeight: 600,
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: 0.6,
              }}
            >
              Item
            </th>
            <th
              style={{
                textAlign: "right",
                padding: "8px 12px",
                color: "#6b7280",
                fontWeight: 600,
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: 0.6,
              }}
            >
              Estoque
            </th>
            <th
              style={{
                textAlign: "right",
                padding: "8px 12px",
                color: "#6b7280",
                fontWeight: 600,
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: 0.6,
              }}
            >
              Mínimo
            </th>
            {showValor && (
              <th
                style={{
                  textAlign: "right",
                  padding: "8px 12px",
                  color: "#6b7280",
                  fontWeight: 600,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                }}
              >
                Compra 12m
              </th>
            )}
            {showValor && (
              <th
                style={{
                  textAlign: "left",
                  padding: "8px 12px",
                  color: "#6b7280",
                  fontWeight: 600,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                }}
              >
                Fornecedor pref.
              </th>
            )}
            {!showValor && (
              <th
                style={{
                  textAlign: "left",
                  padding: "8px 12px",
                  color: "#6b7280",
                  fontWeight: 600,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                }}
              >
                Origem
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.insumo_id}
              style={{ borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}
              onClick={() => onItemClick(item.insumo_id)}
            >
              <td style={{ padding: "10px 12px", fontWeight: 500 }}>
                {item.nome}
                <span style={{ display: "block", fontSize: 11, color: "#6b7280" }}>
                  {item.unidade_medida ?? ""}
                </span>
              </td>
              <td
                style={{
                  padding: "10px 12px",
                  textAlign: "right",
                  color: "#b91c1c",
                  fontWeight: 600,
                }}
              >
                {item.estoque_atual != null
                  ? item.estoque_atual.toLocaleString("pt-BR")
                  : "—"}
              </td>
              <td
                style={{
                  padding: "10px 12px",
                  textAlign: "right",
                  color: "#6b7280",
                }}
              >
                {item.qtd_minima.toLocaleString("pt-BR")}
              </td>
              {showValor && (
                <td
                  style={{
                    padding: "10px 12px",
                    textAlign: "right",
                    color: "#6b7280",
                    fontSize: 12,
                  }}
                >
                  {brl(item.compra_12m)}/ano
                </td>
              )}
              {showValor && (
                <td
                  style={{
                    padding: "10px 12px",
                    fontSize: 12,
                    color: item.fornecedor_preferencial_nome ? "#374151" : "#9ca3af",
                  }}
                >
                  {item.fornecedor_preferencial_nome ?? "—"}
                </td>
              )}
              {!showValor && (
                <td style={{ padding: "10px 12px" }}>
                  <Badge origem={item.origem_reposicao} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PedidosSugestoesClient({
  sugestoes,
  unitName: _unitName,
  unitId,
}: {
  sugestoes: SugestoesReposicao;
  unitName: string;
  unitId: string;
}) {
  const [drawerItemId, setDrawerItemId] = useState<string | null>(null);
  const total = sugestoes.comprar.length + sugestoes.transferir_produzir.length;

  return (
    <div>
      {total === 0 && (
        <p
          style={{
            color: "#15803d",
            fontWeight: 500,
            fontSize: 14,
            padding: "24px 0",
          }}
        >
          Todos os itens estão acima do mínimo. Nenhuma reposição necessária.
        </p>
      )}

      <section style={{ marginBottom: 40 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              margin: 0,
              letterSpacing: -0.2,
            }}
          >
            COMPRAR
            <span
              style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: "#6b7280" }}
            >
              ({sugestoes.comprar.length} itens)
            </span>
          </h2>
          {sugestoes.comprar.length > 0 && (
            <Link
              href="/compras/novo"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#789c55",
                textDecoration: "none",
              }}
            >
              Novo pedido →
            </Link>
          )}
        </div>
        <SugestaoTable items={sugestoes.comprar} showValor={true} onItemClick={setDrawerItemId} />
      </section>

      <section>
        <h2
          style={{
            fontSize: 16,
            fontWeight: 700,
            margin: "0 0 12px",
            letterSpacing: -0.2,
          }}
        >
          TRANSFERIR / PRODUZIR
          <span
            style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: "#6b7280" }}
          >
            ({sugestoes.transferir_produzir.length} itens)
          </span>
        </h2>
        <SugestaoTable items={sugestoes.transferir_produzir} showValor={false} onItemClick={setDrawerItemId} />
      </section>

      <RelógioItemDrawer
        itemId={drawerItemId}
        unitId={unitId}
        onClose={() => setDrawerItemId(null)}
      />
    </div>
  );
}
