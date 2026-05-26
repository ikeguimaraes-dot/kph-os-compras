"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Loader2,
  PackageCheck,
  Send,
  Trash2,
} from "lucide-react";

import { Button, buttonVariants } from "@kph/ui/button";
import { Input } from "@kph/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@kph/ui/dialog";
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
  cancelPurchaseOrder,
  deletePurchaseOrder,
  receivePurchaseOrderFull,
  receivePurchaseOrderPartial,
  sendPurchaseOrder,
} from "@/app/compras/actions";
import {
  PO_STATUS_META,
  type PurchaseOrderDetail,
} from "@/lib/compras/types";

export function CompraDetalheClient({
  order,
}: {
  order: PurchaseOrderDetail;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showPartial, setShowPartial] = useState(false);
  const [received, setReceived] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      order.items.map((it) => [it.id, String(it.quantidade_recebida)]),
    ),
  );

  const meta = PO_STATUS_META[order.status];
  const supplierLabel = order.supplier_name ?? order.fornecedor ?? "—";
  const isFinal = order.status === "recebido" || order.status === "cancelado";

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

  function withTransition(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) window.alert(`Falha: ${r.error}`);
      router.refresh();
    });
  }

  function handleSend() {
    if (!window.confirm(`Marcar pedido ${order.numero} como enviado?`)) return;
    withTransition(() => sendPurchaseOrder(order.id));
  }

  function handleCancel() {
    if (!window.confirm(`Cancelar pedido ${order.numero}? Essa ação pode ser revertida apenas no banco.`)) return;
    withTransition(() => cancelPurchaseOrder(order.id));
  }

  function handleReceiveFull() {
    if (!window.confirm(`Confirmar recebimento total do pedido ${order.numero}?`)) return;
    withTransition(() => receivePurchaseOrderFull(order.id));
  }

  function handleSavePartial() {
    const map: Record<string, number> = {};
    for (const it of order.items) {
      const raw = received[it.id];
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) map[it.id] = n;
    }
    setShowPartial(false);
    withTransition(() => receivePurchaseOrderPartial(order.id, map));
  }

  function handleDelete() {
    if (!window.confirm("Excluir este pedido? Apenas founders podem deletar.")) return;
    startTransition(async () => {
      const r = await deletePurchaseOrder(order.id);
      if (!r.ok) {
        window.alert(`Falha: ${r.error}`);
        return;
      }
      router.push("/compras");
      router.refresh();
    });
  }

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
          {order.status === "rascunho" && (
            <Button onClick={handleSend} disabled={pending}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Send className="mr-2 h-4 w-4" />
              Enviar
            </Button>
          )}
          {(order.status === "enviado" || order.status === "parcial") && (
            <>
              <Button
                variant="outline"
                onClick={() => setShowPartial(true)}
                disabled={pending}
              >
                <PackageCheck className="mr-2 h-4 w-4" />
                Receber parcial
              </Button>
              <Button onClick={handleReceiveFull} disabled={pending}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Receber tudo
              </Button>
            </>
          )}
          {!isFinal && (
            <Button variant="outline" onClick={handleCancel} disabled={pending}>
              <Ban className="mr-2 h-4 w-4" />
              Cancelar
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={handleDelete}
            disabled={pending}
            style={{ color: "var(--destructive)" }}
            aria-label="Excluir"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
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

      {/* Dialog: receber parcial */}
      <Dialog open={showPartial} onOpenChange={setShowPartial}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recebimento parcial · {order.numero}</DialogTitle>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {order.items.map((it) => (
              <div
                key={it.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 100px 80px",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--text)",
                    fontWeight: 500,
                  }}
                >
                  {it.nome}
                </span>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.001"
                  min="0"
                  max={String(it.quantidade)}
                  value={received[it.id] ?? ""}
                  onChange={(e) =>
                    setReceived((m) => ({ ...m, [it.id]: e.target.value }))
                  }
                />
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-3)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  / {Number(it.quantidade)} {it.unidade ?? ""}
                </span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setShowPartial(false)}
                className={buttonVariants({ variant: "outline" })}
              >
                Cancelar
              </button>
              <Button onClick={handleSavePartial} disabled={pending}>
                Salvar recebimento
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
