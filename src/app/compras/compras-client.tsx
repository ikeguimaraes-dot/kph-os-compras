"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ShoppingCart } from "lucide-react";

import { Input } from "@kph/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@kph/ui/select";
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
  type PurchaseOrderStatus,
  type PurchaseOrderWithRelations,
} from "@/lib/compras/types";

const STATUS_VALUES: PurchaseOrderStatus[] = [
  "rascunho",
  "enviado",
  "parcial",
  "recebido",
  "cancelado",
];

export function ComprasClient({
  orders,
}: {
  orders: PurchaseOrderWithRelations[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("__all__");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== "__all__" && o.status !== statusFilter) return false;
      if (q) {
        const hay =
          `${o.numero} ${o.fornecedor ?? ""} ${o.supplier_name ?? ""} ${o.brand_name ?? ""} ${o.unit_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, search, statusFilter]);

  return (
    <>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <div style={{ position: "relative", minWidth: 240, flex: 1 }}>
          <Search
            size={14}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-3)",
              pointerEvents: "none",
            }}
          />
          <Input
            placeholder="Buscar número, fornecedor, marca…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 30 }}
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v ?? "__all__")}
        >
          <SelectTrigger style={{ minWidth: 160 }}>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos status</SelectItem>
            {STATUS_VALUES.map((s) => (
              <SelectItem key={s} value={s}>
                {PO_STATUS_META[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {orders.length === 0 ? (
        <EmptyState />
      ) : filtered.length === 0 ? (
        <div
          style={{
            padding: "32px 16px",
            textAlign: "center",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            color: "var(--text-3)",
            fontSize: 13,
          }}
        >
          Nenhum pedido com esses filtros.
        </div>
      ) : (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 12,
            background: "var(--surface)",
            overflow: "hidden",
          }}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Marca / Unidade</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Previsto</TableHead>
                <TableHead style={{ textAlign: "right" }}>Itens</TableHead>
                <TableHead style={{ textAlign: "right" }}>Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((o) => {
                const meta = PO_STATUS_META[o.status];
                const supplierLabel = o.supplier_name ?? o.fornecedor ?? "—";
                return (
                  <TableRow
                    key={o.id}
                    onClick={() => router.push(`/compras/${o.id}`)}
                    style={{ cursor: "pointer" }}
                  >
                    <TableCell
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--text)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {o.numero}
                    </TableCell>
                    <TableCell style={{ fontSize: 12, color: "var(--text-2)" }}>
                      {supplierLabel}
                    </TableCell>
                    <TableCell>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: o.brand_color ?? "var(--text-2)",
                        }}
                      >
                        {o.brand_name ?? "—"}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                        {o.unit_name ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell
                      style={{
                        fontSize: 12,
                        color: "var(--text-2)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatDateBR(o.data_pedido)}
                    </TableCell>
                    <TableCell
                      style={{
                        fontSize: 12,
                        color: "var(--text-2)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {o.data_prevista ? formatDateBR(o.data_prevista) : "—"}
                    </TableCell>
                    <TableCell
                      style={{
                        fontSize: 12,
                        color: "var(--text-2)",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {o.items_count}
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
                      {formatBRL(o.valor_total)}
                    </TableCell>
                    <TableCell>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
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
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: "56px 20px",
        textAlign: "center",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
      }}
    >
      <ShoppingCart
        size={32}
        style={{ color: "var(--text-3)", marginBottom: 8 }}
      />
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
        Nenhum pedido cadastrado
      </div>
      <p style={{ fontSize: 12, color: "var(--text-3)", margin: "6px 0 14px" }}>
        Crie o primeiro pedido pra começar a controlar fornecedores e
        recebimentos.
      </p>
    </div>
  );
}
