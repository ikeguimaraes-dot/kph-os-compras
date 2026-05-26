"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";

import { Button, buttonVariants } from "@kph/ui/button";
import { Input } from "@kph/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@kph/ui/select";
import { Textarea } from "@kph/ui/textarea";
import { createPurchaseOrder } from "@/app/compras/actions";
import type { Supplier } from "@/lib/compras/types";
import { formatBRL } from "@/lib/format";

type ItemRow = {
  key: string;
  nome: string;
  unidade: string;
  quantidade: string;
  preco_unitario: string;
};

function newRow(): ItemRow {
  return {
    key: Math.random().toString(36).slice(2),
    nome: "",
    unidade: "",
    quantidade: "",
    preco_unitario: "",
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NovoCompraClient({
  unitId,
  unitName,
  brandId,
  suppliers,
}: {
  unitId: string;
  unitName: string;
  brandId: string;
  suppliers: Supplier[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [supplierMode, setSupplierMode] = useState<"cadastrado" | "manual">(
    suppliers.length > 0 ? "cadastrado" : "manual",
  );
  const [supplierId, setSupplierId] = useState<string>("");
  const [fornecedor, setFornecedor] = useState<string>("");
  const [dataPedido, setDataPedido] = useState<string>(todayIso());
  const [dataPrevista, setDataPrevista] = useState<string>("");
  const [observacoes, setObservacoes] = useState<string>("");
  const [items, setItems] = useState<ItemRow[]>([newRow()]);

  const total = useMemo(() => {
    return items.reduce((acc, it) => {
      const q = Number(it.quantidade);
      const p = Number(it.preco_unitario);
      if (!Number.isFinite(q) || !Number.isFinite(p)) return acc;
      return acc + q * p;
    }, 0);
  }, [items]);

  const validItems = items.filter(
    (it) =>
      it.nome.trim().length > 0 &&
      Number(it.quantidade) > 0 &&
      Number(it.preco_unitario) >= 0,
  );

  const canSubmit =
    !pending &&
    dataPedido.length === 10 &&
    validItems.length > 0 &&
    (supplierMode === "manual"
      ? fornecedor.trim().length > 0
      : supplierId.length > 0);

  function updateRow(idx: number, patch: Partial<ItemRow>) {
    setItems((arr) => arr.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setItems((arr) => [...arr, newRow()]);
  }
  function removeRow(idx: number) {
    setItems((arr) => (arr.length === 1 ? arr : arr.filter((_, i) => i !== idx)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);

    startTransition(async () => {
      const r = await createPurchaseOrder({
        unit_id: unitId,
        brand_id: brandId,
        fornecedor: supplierMode === "manual" ? fornecedor.trim() : null,
        supplier_id: supplierMode === "cadastrado" ? supplierId : null,
        data_pedido: dataPedido,
        data_prevista: dataPrevista || null,
        observacoes: observacoes.trim() || null,
        items: validItems.map((it) => ({
          nome: it.nome.trim(),
          unidade: it.unidade.trim() || null,
          quantidade: Number(it.quantidade),
          preco_unitario: Number(it.preco_unitario),
        })),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(`/compras/${r.data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 940, margin: "0 auto" }}>
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

      {/* Cabeçalho do pedido */}
      <Card title="Cabeçalho do pedido">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}
        >
          <Field label="Unidade">
            <ReadOnlyValue>{unitName}</ReadOnlyValue>
          </Field>

          <Field label="Fornecedor" required>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <ToggleSeg
                  value={supplierMode === "cadastrado"}
                  onClick={() => setSupplierMode("cadastrado")}
                  disabled={suppliers.length === 0}
                >
                  Cadastrado
                </ToggleSeg>
                <ToggleSeg
                  value={supplierMode === "manual"}
                  onClick={() => setSupplierMode("manual")}
                >
                  Manual
                </ToggleSeg>
              </div>
              {supplierMode === "cadastrado" ? (
                <Select value={supplierId} onValueChange={(v) => v && setSupplierId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={suppliers.length ? "Selecionar fornecedor" : "Sem fornecedores"} />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.filter((s) => s.ativo).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="Nome livre do fornecedor"
                  value={fornecedor}
                  onChange={(e) => setFornecedor(e.target.value)}
                />
              )}
            </div>
          </Field>

          <Field label="Data do pedido" required>
            <Input
              type="date"
              value={dataPedido}
              onChange={(e) => setDataPedido(e.target.value)}
            />
          </Field>

          <Field label="Previsão de entrega">
            <Input
              type="date"
              value={dataPrevista}
              onChange={(e) => setDataPrevista(e.target.value)}
            />
          </Field>

          <Field label="Observações" wide>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
              placeholder="Anotações internas, urgência, etc."
            />
          </Field>
        </div>
      </Card>

      {/* Itens */}
      <Card
        title={`Itens do pedido · ${items.length}`}
        action={
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            Adicionar item
          </Button>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((it, idx) => (
            <div
              key={it.key}
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(160px, 2fr) 70px 80px 110px 100px auto",
                gap: 8,
                alignItems: "center",
              }}
            >
              <Input
                placeholder="Nome do item"
                value={it.nome}
                onChange={(e) => updateRow(idx, { nome: e.target.value })}
              />
              <Input
                placeholder="Un."
                value={it.unidade}
                onChange={(e) => updateRow(idx, { unidade: e.target.value })}
              />
              <Input
                type="number"
                inputMode="decimal"
                step="0.001"
                min="0"
                placeholder="Qtd."
                value={it.quantidade}
                onChange={(e) => updateRow(idx, { quantidade: e.target.value })}
              />
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="Preço un."
                value={it.preco_unitario}
                onChange={(e) =>
                  updateRow(idx, { preco_unitario: e.target.value })
                }
              />
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-2)",
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatBRL(
                  Number(it.quantidade || 0) * Number(it.preco_unitario || 0),
                )}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeRow(idx)}
                disabled={items.length === 1}
                aria-label="Remover item"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px dashed var(--border)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 12,
            alignItems: "baseline",
          }}
        >
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>Total</span>
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "var(--text)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatBRL(total)}
          </span>
        </div>
      </Card>

      {error && (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 12px",
            background: "rgba(239,68,68,0.10)",
            border: "1px solid rgba(239,68,68,0.30)",
            borderRadius: 8,
            fontSize: 12,
            color: "#B91C1C",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Link href="/compras" className={buttonVariants({ variant: "outline" })}>
          Cancelar
        </Link>
        <Button type="submit" disabled={!canSubmit}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Criar pedido (rascunho)
        </Button>
      </div>
    </form>
  );
}

function Card({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 18,
        marginBottom: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <h2
          style={{
            fontSize: 15,
            fontWeight: 700,
            margin: 0,
            color: "var(--text)",
          }}
        >
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  required,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  wide?: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        gridColumn: wide ? "1 / -1" : "auto",
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-2)",
          textTransform: "uppercase",
          letterSpacing: 0.6,
        }}
      >
        {label}
        {required && <span style={{ color: "var(--destructive)" }}> *</span>}
      </span>
      {children}
    </label>
  );
}

function ReadOnlyValue({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "9px 12px",
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        color: "var(--text)",
      }}
    >
      {children}
    </div>
  );
}

function ToggleSeg({
  value,
  onClick,
  disabled,
  children,
}: {
  value: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        padding: "8px 10px",
        background: value ? "var(--brand-soft)" : "var(--surface-2)",
        color: value ? "var(--brand)" : "var(--text-2)",
        border: `1px solid ${value ? "var(--brand)" : "var(--border)"}`,
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
      aria-pressed={value}
    >
      {children}
    </button>
  );
}
