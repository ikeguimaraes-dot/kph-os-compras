"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Search, Upload, UtensilsCrossed } from "lucide-react";
import { Button } from "@kph/ui/button";
import { Input } from "@kph/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@kph/ui/table";
import { formatBRL } from "@/lib/format";
import {
  cmvPct,
  MENU_CATEGORIA_LABELS,
  type MenuItemFicha,
} from "@/lib/cardapio/types";
import { ImportDialog } from "./import-dialog";

type TipoFilter = "produtos" | "subprodutos" | "todos";

// Cor do CMV: ≤32% bom (verde), ≤40% atenção (amarelo), >40% alto (vermelho).
function cmvColor(pct: number | null): string {
  if (pct === null) return "var(--text-3)";
  if (pct <= 32) return "#16A34A";
  if (pct <= 40) return "#A16207";
  return "#DC2626";
}

function KpiCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 4,
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
      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: 11, color: "var(--text-3)" }}>{hint}</div>}
    </div>
  );
}

function TipoBadge({ isSub }: { isSub: boolean }) {
  const color = isSub ? "#7C3AED" : "#0369A1";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 99,
        fontSize: 11,
        fontWeight: 600,
        background: `${color}1A`,
        color,
      }}
    >
      {isSub ? "Subproduto" : "Produto"}
    </span>
  );
}

export function CardapioClient({
  items,
  currentUnitId,
  currentUnitName,
}: {
  items: MenuItemFicha[];
  currentUnitId: string | null;
  currentUnitName: string | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [tipo, setTipo] = useState<TipoFilter>("produtos");
  const [importOpen, setImportOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((m) => {
      if (tipo === "produtos" && m.is_subproduto) return false;
      if (tipo === "subprodutos" && !m.is_subproduto) return false;
      if (q) {
        const hay = `${m.nome} ${m.codigo ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, tipo]);

  const kpis = useMemo(() => {
    const ativos = items.filter((m) => m.ativo);
    const produtos = ativos.filter((m) => !m.is_subproduto);
    const comPreco = produtos.filter((m) => m.preco_venda > 0);
    const cmvs = comPreco
      .map((m) => cmvPct(m.custo_total, m.preco_venda))
      .filter((n): n is number => n !== null);
    const cmvMedio = cmvs.length ? cmvs.reduce((a, b) => a + b, 0) / cmvs.length : null;
    return {
      total: ativos.length,
      produtos: produtos.length,
      subprodutos: ativos.length - produtos.length,
      semPreco: produtos.length - comPreco.length,
      cmvMedio,
    };
  }, [items]);

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto" }}>
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 20,
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.6,
              textTransform: "uppercase",
              color: "var(--text-3)",
            }}
          >
            Compras · Cardápio {currentUnitName ? `· ${currentUnitName}` : ""}
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: "6px 0 4px", color: "var(--text)", letterSpacing: -0.4 }}>
            Cardápio / Fichas Técnicas
          </h1>
          <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0, maxWidth: 600 }}>
            Custo de cada produto e subproduto a partir das fichas do Everest. Preço de venda e
            categoria são preenchidos à mão e preservados a cada importação.
          </p>
        </div>
        <Button onClick={() => setImportOpen(true)} style={{ gap: 6 }}>
          <Upload size={15} />
          Importar ficha técnica (PDF)
        </Button>
      </header>

      <div
        style={{
          display: "grid",
          gap: 10,
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          marginBottom: 20,
        }}
      >
        <KpiCard label="Itens ativos" value={kpis.total} hint={`${kpis.produtos} produtos · ${kpis.subprodutos} subprodutos`} />
        <KpiCard label="Produtos" value={kpis.produtos} hint="Vendáveis (ficha técnica)" />
        <KpiCard
          label="Sem preço"
          value={kpis.semPreco}
          hint={kpis.semPreco > 0 ? "Defina o preço de venda" : "Todos precificados"}
        />
        <KpiCard
          label="CMV médio"
          value={kpis.cmvMedio !== null ? `${kpis.cmvMedio.toFixed(1)}%` : "—"}
          hint="Produtos com preço"
        />
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
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
            placeholder="Buscar nome ou código…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 30 }}
          />
        </div>
        <div style={{ display: "flex", gap: 2, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 2 }}>
          {(["produtos", "subprodutos", "todos"] as TipoFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "6px 12px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                background: tipo === t ? "var(--brand, #D4A574)" : "transparent",
                color: tipo === t ? "#1a1a1a" : "var(--text-3)",
                textTransform: "capitalize",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "56px 24px", textAlign: "center" }}>
            <UtensilsCrossed size={32} style={{ color: "var(--text-3)", marginBottom: 10 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
              Nenhuma ficha encontrada
            </div>
            <p style={{ fontSize: 12, color: "var(--text-3)", margin: "6px 0 16px" }}>
              {items.length === 0
                ? "Importe o PDF de fichas técnicas do Everest pra começar."
                : "Nenhum resultado pros filtros atuais."}
            </p>
            {items.length === 0 && (
              <Button onClick={() => setImportOpen(true)} style={{ gap: 6 }}>
                <Upload size={15} /> Importar ficha técnica
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead style={{ textAlign: "right" }}>Custo</TableHead>
                <TableHead style={{ textAlign: "right" }}>Preço</TableHead>
                <TableHead style={{ textAlign: "right" }}>CMV %</TableHead>
                <TableHead style={{ textAlign: "center" }}>Tipo</TableHead>
                <TableHead style={{ textAlign: "center" }}>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => {
                const cmv = cmvPct(m.custo_total, m.preco_venda);
                return (
                  <TableRow
                    key={m.id}
                    onClick={() => router.push(`/cardapio/${m.id}`)}
                    style={{ cursor: "pointer" }}
                  >
                    <TableCell style={{ fontSize: 12, color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
                      {m.codigo ?? "—"}
                    </TableCell>
                    <TableCell style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{m.nome}</TableCell>
                    <TableCell style={{ fontSize: 12, color: "var(--text-2)" }}>
                      {MENU_CATEGORIA_LABELS[m.categoria] ?? m.categoria}
                    </TableCell>
                    <TableCell style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>
                      {formatBRL(m.custo_total)}
                    </TableCell>
                    <TableCell style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>
                      {m.preco_venda > 0 ? formatBRL(m.preco_venda) : <span style={{ color: "var(--text-3)" }}>—</span>}
                    </TableCell>
                    <TableCell
                      style={{
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        fontSize: 13,
                        fontWeight: 700,
                        color: cmvColor(cmv),
                      }}
                    >
                      {cmv !== null ? `${cmv.toFixed(1)}%` : "—"}
                    </TableCell>
                    <TableCell style={{ textAlign: "center" }}>
                      <TipoBadge isSub={m.is_subproduto} />
                    </TableCell>
                    <TableCell style={{ textAlign: "center" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 99,
                          background: m.ativo ? "rgba(34,197,94,0.12)" : "var(--surface-2)",
                          color: m.ativo ? "#22C55E" : "var(--text-3)",
                        }}
                      >
                        {m.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 6 }}>
        <BookOpen size={12} />
        {filtered.length} de {items.length} {items.length === 1 ? "ficha" : "fichas"}
      </div>

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => router.refresh()}
        defaultUnitId={currentUnitId}
      />
    </div>
  );
}
