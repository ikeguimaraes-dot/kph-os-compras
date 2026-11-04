"use client";

import { useMemo } from "react";
import Link from "next/link";
import {ArrowLeft, PackageCheck} from 'lucide-react';
import {buttonVariants} from '@kph/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@kph/ui/table";
import { formatBRL, formatDateBR } from "@/lib/format";
import {
  PO_STATUS_META,
  type PurchaseOrderDetail,
} from "@/lib/compras/types";

export function CompraDetalheClient({
  order,
}: {
  order: PurchaseOrderDetail;
}) {
  const meta = PO_STATUS_META[order.status];
  const supplierLabel = order.supplier_name ?? order.fornecedor ?? "—";

  const totals = useMemo(() => {
    const totalQ = order.items.reduce((a, it) => a + Number(it.quantidade), 0);
    const totalRec = order.items.reduce(
      (a, it) => a + Number(it.quantidade_recebida),
      0,
    );
    return {
      totalQ,
      totalRec,
      pctRec: totalQ > 0 ? Math.round((totalRec / totalQ) * 100) : 0,
    };
  }, [order.items]);

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <Link
        href="/compras"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          color: "var(--text-3)",
          textDecoration: "none",
          marginBottom: 16,
        }}
      >
        <ArrowLeft size={14} />
        Compras
      </Link>

      {/* Header */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 20,
          marginBottom: 16,
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 800,
                margin: 0,
                color: "var(--text)",
                letterSpacing: -0.4,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {order.numero}
            </h1>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                fontSize: 11,
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: 99,
                background: meta.bg,
                color: meta.fg,
              }}
            >
              {meta.label}
            </span>
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-3)",
              marginTop: 6,
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <span>
              <strong style={{ color: "var(--text-2)" }}>Fornecedor:</strong>{" "}
              {supplierLabel}
            </span>
            <span>
              <strong style={{ color: "var(--text-2)" }}>Marca:</strong>{" "}
              {order.brand_name ?? "—"}
            </span>
            <span>
              <strong style={{ color: "var(--text-2)" }}>Unidade:</strong>{" "}
              {order.unit_name ?? "—"}
            </span>
            <span>
              <strong style={{ color: "var(--text-2)" }}>Pedido:</strong>{" "}
              {formatDateBR(order.data_pedido)}
            </span>
            {order.data_prevista && (
              <span>
                <strong style={{ color: "var(--text-2)" }}>Previsto:</strong>{" "}
                {formatDateBR(order.data_prevista)}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className={buttonVariants({variant:'outline'})} href={'/compras/recebimento?pedido='+order.id}>
            <PackageCheck className="mr-2 h-4 w-4"/> Aprovação e conferência
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gap: 10,
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          marginBottom: 16,
        }}
      >
        <Kpi label="Itens" value={String(order.items.length)} />
        <Kpi
          label="Quantidade"
          value={`${totals.totalRec} / ${totals.totalQ}`}
          hint={`${totals.pctRec}% recebido`}
        />
        <Kpi label="Valor total" value={formatBRL(order.valor_total)} />
      </div>

      {/* Items */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          overflow: "hidden",
          marginBottom: 16,
        }}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Unid.</TableHead>
              <TableHead style={{ textAlign: "right" }}>Qtd. pedida</TableHead>
              <TableHead style={{ textAlign: "right" }}>Recebida</TableHead>
              <TableHead style={{ textAlign: "right" }}>Preço un.</TableHead>
              <TableHead style={{ textAlign: "right" }}>Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.items.map((it) => (
              <TableRow key={it.id}>
                <TableCell
                  style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}
                >
                  {it.nome}
                </TableCell>
                <TableCell style={{ fontSize: 12, color: "var(--text-2)" }}>
                  {it.unidade ?? "—"}
                </TableCell>
                <TableCell
                  style={{
                    fontSize: 12,
                    color: "var(--text-2)",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {Number(it.quantidade)}
                </TableCell>
                <TableCell
                  style={{
                    fontSize: 12,
                    color:
                      Number(it.quantidade_recebida) >= Number(it.quantidade)
                        ? "#15803D"
                        : Number(it.quantidade_recebida) > 0
                        ? "#A16207"
                        : "var(--text-3)",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    fontWeight: 600,
                  }}
                >
                  {Number(it.quantidade_recebida)}
                </TableCell>
                <TableCell
                  style={{
                    fontSize: 12,
                    color: "var(--text-2)",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatBRL(it.preco_unitario)}
                </TableCell>
                <TableCell
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text)",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatBRL(it.total)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {order.observacoes && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-3)",
              textTransform: "uppercase",
              letterSpacing: 0.6,
              marginBottom: 6,
            }}
          >
            Observações
          </div>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-2)",
              margin: 0,
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
            }}
          >
            {order.observacoes}
          </p>
        </div>
      )}


    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "var(--text-3)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color: "var(--text)",
          marginTop: 4,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
          {hint}
        </div>
      )}
    </div>
  );
}
