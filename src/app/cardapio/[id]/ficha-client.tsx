"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  Plus,
  StickyNote,
  Trash2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Button } from "@kph/ui/button";
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
  MENU_CATEGORIAS,
  MENU_CATEGORIA_LABELS,
  type MenuItemFicha,
} from "@/lib/cardapio/types";
import { CATEGORIA_LABELS } from "@kph/db/types/compras-ingredientes";
import type { RecipeItemWithIngredient } from "@kph/db/types/compras-ingredientes";
import {
  updateRecipeItemExtended,
  removeRecipeItemExtended,
  addRecipeItemWithIngredient,
  addRecipeNote,
  removeRecipeNote,
} from "@/lib/compras/recipe-actions";
import {
  updateMenuItemPreco,
  updateMenuItemCategoria,
} from "@/lib/compras/menu-item-actions";
import type { RecipeNote } from "./page";

type Breakdown = {
  total_cost: number;
  by_categoria: Record<string, number>;
  items: Array<{ nome: string; quantidade: number; unidade: string | null; custo: number; pct_total: number }>;
};

const CHART_COLORS = ["#D4A574", "#3B82F6", "#22C55E", "#A855F7", "#F59E0B", "#EF4444", "#06B6D4", "#EC4899"];

function cmvColor(pct: number | null): string {
  if (pct === null) return "var(--text-3)";
  if (pct <= 32) return "#16A34A";
  if (pct <= 40) return "#A16207";
  return "#DC2626";
}

// ingredient pode ter menu_item_id (drill-down) — não está no tipo Ingredient.
function ingredientMenuItemId(row: RecipeItemWithIngredient): string | null {
  const ing = row.ingredient as unknown as { menu_item_id?: string | null } | null;
  return ing?.menu_item_id ?? null;
}

export function FichaClient({
  ficha,
  items: initialItems,
  breakdown,
  notes: initialNotes,
}: {
  ficha: MenuItemFicha;
  items: RecipeItemWithIngredient[];
  breakdown: Breakdown;
  notes: RecipeNote[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [preco, setPreco] = useState(ficha.preco_venda ? String(ficha.preco_venda) : "");
  const [categoria, setCategoria] = useState(ficha.categoria);
  const [items, setItems] = useState(initialItems);
  const [notes, setNotes] = useState(initialNotes);
  const [novaNota, setNovaNota] = useState("");
  const [savingMsg, setSavingMsg] = useState<string | null>(null);

  const custoTotal = useMemo(
    () => items.reduce((s, r) => s + Number(r.custo_total), 0),
    [items],
  );
  const precoNum = Number(preco.replace(",", ".")) || 0;
  const cmv = cmvPct(custoTotal, precoNum);

  const chartData = useMemo(
    () =>
      Object.entries(breakdown.by_categoria)
        .map(([cat, custo]) => ({
          cat: CATEGORIA_LABELS[cat as keyof typeof CATEGORIA_LABELS] ?? cat,
          custo: Math.round(custo * 100) / 100,
        }))
        .sort((a, b) => b.custo - a.custo),
    [breakdown],
  );

  function flash(msg: string) {
    setSavingMsg(msg);
    setTimeout(() => setSavingMsg(null), 1800);
  }

  function savePreco() {
    const v = Number(preco.replace(",", ".")) || 0;
    if (v === ficha.preco_venda) return;
    startTransition(async () => {
      const r = await updateMenuItemPreco(ficha.id, v);
      if (r.ok) { flash("Preço salvo"); router.refresh(); }
      else flash(r.error);
    });
  }

  function saveCategoria(next: string) {
    setCategoria(next);
    startTransition(async () => {
      const r = await updateMenuItemCategoria(ficha.id, next);
      if (r.ok) { flash("Categoria salva"); router.refresh(); }
      else flash(r.error);
    });
  }

  function patchItem(id: string, patch: { quantidade?: number; custo_unitario?: number; perda_pct?: number | null }) {
    startTransition(async () => {
      const r = await updateRecipeItemExtended(id, ficha.id, patch);
      if (r.ok) {
        setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...r.data } : x)));
        flash("Linha atualizada");
      } else flash(r.error);
    });
  }

  function removeItem(id: string) {
    startTransition(async () => {
      const r = await removeRecipeItemExtended(id, ficha.id);
      if (r.ok) { setItems((prev) => prev.filter((x) => x.id !== id)); flash("Insumo removido"); }
      else flash(r.error);
    });
  }

  function addNote() {
    if (!novaNota.trim()) return;
    startTransition(async () => {
      const r = await addRecipeNote(ficha.id, novaNota);
      if (r.ok) { setNotes((p) => [r.data, ...p]); setNovaNota(""); }
      else flash(r.error);
    });
  }

  function delNote(id: string) {
    startTransition(async () => {
      const r = await removeRecipeNote(id, ficha.id);
      if (r.ok) setNotes((p) => p.filter((n) => n.id !== id));
    });
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Voltar */}
      <Link
        href="/cardapio"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          color: "var(--text-3)",
          textDecoration: "none",
          marginBottom: 14,
        }}
      >
        <ArrowLeft size={14} /> Voltar ao cardápio
      </Link>

      {/* Header */}
      <header style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "var(--text)" }}>{ficha.nome}</h1>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 99,
              fontSize: 11,
              fontWeight: 600,
              background: ficha.is_subproduto ? "#7C3AED1A" : "#0369A11A",
              color: ficha.is_subproduto ? "#7C3AED" : "#0369A1",
            }}
          >
            {ficha.is_subproduto ? "Subproduto" : "Produto"}
          </span>
          {ficha.codigo && (
            <span style={{ fontSize: 12, color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
              #{ficha.codigo}
            </span>
          )}
          {savingMsg && (
            <span style={{ fontSize: 12, color: "var(--brand, #16A34A)", marginLeft: "auto" }}>{savingMsg}</span>
          )}
        </div>
      </header>

      {/* KPIs + edição */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 10,
          marginBottom: 20,
        }}
      >
        <Field label="Custo total (ficha)">
          <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {formatBRL(custoTotal)}
          </div>
        </Field>
        <Field label="Preço de venda">
          <input
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            onBlur={savePreco}
            placeholder="0,00"
            style={{
              width: "100%",
              fontSize: 20,
              fontWeight: 700,
              background: "transparent",
              border: "none",
              borderBottom: "1px dashed var(--border)",
              color: "var(--text)",
              outline: "none",
              fontVariantNumeric: "tabular-nums",
              padding: "2px 0",
            }}
          />
        </Field>
        <Field label="CMV %">
          <div style={{ fontSize: 20, fontWeight: 700, color: cmvColor(cmv), fontVariantNumeric: "tabular-nums" }}>
            {cmv !== null ? `${cmv.toFixed(1)}%` : "—"}
          </div>
        </Field>
        <Field label="Categoria">
          <select
            value={categoria}
            onChange={(e) => saveCategoria(e.target.value)}
            style={{
              width: "100%",
              fontSize: 14,
              fontWeight: 600,
              background: "transparent",
              border: "none",
              borderBottom: "1px dashed var(--border)",
              color: "var(--text)",
              outline: "none",
              padding: "4px 0",
            }}
          >
            {!MENU_CATEGORIAS.includes(categoria as never) && <option value={categoria}>{categoria}</option>}
            {MENU_CATEGORIAS.map((c) => (
              <option key={c} value={c}>{MENU_CATEGORIA_LABELS[c]}</option>
            ))}
          </select>
        </Field>
        <Field label="Rendimento">
          <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {ficha.rendimento}
          </div>
        </Field>
      </div>

      {/* Breakdown de custo por categoria */}
      {chartData.length > 0 && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 16,
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>
            Custo por categoria de insumo
          </div>
          <div style={{ width: "100%", height: Math.max(120, chartData.length * 34) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16, top: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="cat"
                  width={130}
                  tick={{ fontSize: 11, fill: "var(--text-3)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "var(--surface-2, rgba(0,0,0,0.04))" }}
                  formatter={(v) => formatBRL(Number(v))}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}
                />
                <Bar dataKey="custo" radius={[0, 4, 4, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Insumos */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", margin: 0 }}>
          Insumos da ficha ({items.length})
        </h2>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Insumo</TableHead>
              <TableHead style={{ textAlign: "right" }}>Qtd</TableHead>
              <TableHead style={{ textAlign: "center" }}>Un</TableHead>
              <TableHead style={{ textAlign: "right" }}>Custo unit.</TableHead>
              <TableHead style={{ textAlign: "right" }}>Perda %</TableHead>
              <TableHead style={{ textAlign: "right" }}>Custo total</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((r) => {
              const drill = ingredientMenuItemId(r);
              return (
                <TableRow key={r.id}>
                  <TableCell style={{ fontSize: 13, color: "var(--text)" }}>
                    {drill ? (
                      <Link
                        href={`/cardapio/${drill}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          color: "var(--brand, #0369A1)",
                          textDecoration: "none",
                          fontWeight: 600,
                        }}
                      >
                        {r.insumo}
                        <ChevronRight size={13} />
                      </Link>
                    ) : (
                      <span style={{ fontWeight: 500 }}>{r.insumo}</span>
                    )}
                  </TableCell>
                  <TableCell style={{ textAlign: "right" }}>
                    <NumCell
                      value={Number(r.quantidade)}
                      onCommit={(v) => patchItem(r.id, { quantidade: v })}
                    />
                  </TableCell>
                  <TableCell style={{ textAlign: "center", fontSize: 11, color: "var(--text-3)", textTransform: "uppercase" }}>
                    {r.unidade ?? "—"}
                  </TableCell>
                  <TableCell style={{ textAlign: "right" }}>
                    <NumCell
                      value={Number(r.custo_unitario)}
                      onCommit={(v) => patchItem(r.id, { custo_unitario: v })}
                      money
                    />
                  </TableCell>
                  <TableCell style={{ textAlign: "right" }}>
                    <NumCell
                      value={Number(r.perda_pct ?? 0)}
                      onCommit={(v) => patchItem(r.id, { perda_pct: v })}
                    />
                  </TableCell>
                  <TableCell style={{ textAlign: "right", fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {formatBRL(Number(r.custo_total))}
                  </TableCell>
                  <TableCell style={{ textAlign: "right" }}>
                    <button
                      onClick={() => removeItem(r.id)}
                      aria-label="Remover"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: 4 }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <AddInsumoRow menuItemId={ficha.id} onAdded={(row) => setItems((p) => [...p, row])} onError={flash} />
      </div>

      {/* Notas */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <StickyNote size={15} style={{ color: "var(--text-3)" }} />
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: 0 }}>Notas da receita</h2>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <textarea
            value={novaNota}
            onChange={(e) => setNovaNota(e.target.value)}
            placeholder="Modo de preparo, observações, substituições…"
            style={{
              flex: 1,
              minHeight: 44,
              fontSize: 13,
              padding: "8px 10px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--text)",
              resize: "vertical",
              outline: "none",
            }}
          />
          <Button onClick={addNote} disabled={!novaNota.trim()} style={{ gap: 6, alignSelf: "flex-start" }}>
            <Plus size={14} /> Adicionar
          </Button>
        </div>

        {notes.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-3)" }}>Nenhuma nota ainda.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {notes.map((n) => (
              <div
                key={n.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "8px 12px",
                  background: "var(--surface-2, var(--surface))",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "var(--text-2)",
                }}
              >
                <span style={{ whiteSpace: "pre-wrap" }}>{n.nota}</span>
                <button
                  onClick={() => delNote(n.id)}
                  aria-label="Remover nota"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", flexShrink: 0 }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
      <div
        style={{
          fontSize: 11,
          color: "var(--text-3)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function NumCell({
  value,
  onCommit,
  money,
}: {
  value: number;
  onCommit: (v: number) => void;
  money?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => {
        const v = Number(draft.replace(",", "."));
        if (Number.isFinite(v) && v !== value) onCommit(v);
        else setDraft(String(value));
      }}
      style={{
        width: money ? 84 : 64,
        textAlign: "right",
        fontSize: 13,
        background: "transparent",
        border: "1px solid transparent",
        borderRadius: 6,
        color: "var(--text)",
        outline: "none",
        padding: "2px 4px",
        fontVariantNumeric: "tabular-nums",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.border = "1px solid var(--border)")}
      onMouseLeave={(e) => (e.currentTarget.style.border = "1px solid transparent")}
    />
  );
}

function AddInsumoRow({
  menuItemId,
  onAdded,
  onError,
}: {
  menuItemId: string;
  onAdded: (row: RecipeItemWithIngredient) => void;
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [insumo, setInsumo] = useState("");
  const [qtd, setQtd] = useState("");
  const [custo, setCusto] = useState("");
  const [unidade, setUnidade] = useState("");
  const [perda, setPerda] = useState("");

  function add() {
    const quantidade = Number(qtd.replace(",", "."));
    if (!insumo.trim() || !(quantidade > 0)) { onError("Informe insumo e quantidade"); return; }
    startTransition(async () => {
      const r = await addRecipeItemWithIngredient({
        menu_item_id: menuItemId,
        insumo: insumo.trim(),
        quantidade,
        unidade: unidade.trim() || null,
        custo_unitario: Number(custo.replace(",", ".")) || 0,
        perda_pct: perda ? Number(perda.replace(",", ".")) : null,
      });
      if (r.ok) {
        onAdded({ ...r.data, ingredient: null } as RecipeItemWithIngredient);
        setInsumo(""); setQtd(""); setCusto(""); setUnidade(""); setPerda("");
        setOpen(false);
        router.refresh();
      } else onError(r.error);
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          width: "100%",
          padding: "10px 16px",
          background: "transparent",
          border: "none",
          borderTop: "1px solid var(--border)",
          color: "var(--text-3)",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Plus size={14} /> Adicionar insumo
      </button>
    );
  }

  const inp: React.CSSProperties = {
    fontSize: 13,
    padding: "6px 8px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    color: "var(--text)",
    outline: "none",
  };

  return (
    <div style={{ borderTop: "1px solid var(--border)", padding: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input style={{ ...inp, flex: 2, minWidth: 160 }} placeholder="Nome do insumo" value={insumo} onChange={(e) => setInsumo(e.target.value)} autoFocus />
      <input style={{ ...inp, width: 70, textAlign: "right" }} placeholder="Qtd" value={qtd} onChange={(e) => setQtd(e.target.value)} />
      <input style={{ ...inp, width: 60 }} placeholder="Un" value={unidade} onChange={(e) => setUnidade(e.target.value)} />
      <input style={{ ...inp, width: 90, textAlign: "right" }} placeholder="Custo un." value={custo} onChange={(e) => setCusto(e.target.value)} />
      <input style={{ ...inp, width: 70, textAlign: "right" }} placeholder="Perda %" value={perda} onChange={(e) => setPerda(e.target.value)} />
      <Button onClick={add} style={{ gap: 4 }}><Plus size={14} /> Salvar</Button>
      <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
    </div>
  );
}
