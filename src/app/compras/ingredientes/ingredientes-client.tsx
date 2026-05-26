"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Carrot,
  Check,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  Search,
  X,
} from "lucide-react";
import { Button } from "@kph/ui/button";
import { Input } from "@kph/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@kph/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@kph/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@kph/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@kph/ui/dialog";
import { buttonVariants } from "@kph/ui/button";
import { formatBRL } from "@/lib/format";
import {
  createIngredient,
  updateIngredient,
  toggleIngredientAtivo,
} from "@/lib/compras/ingredient-actions";
import type {
  Ingredient,
  IngredienteCategoria,
  UnidadePadrao,
  IngredientInsert,
  IngredientUpdate,
} from "@kph/db/types/compras-ingredientes";
import {
  CATEGORIA_LABELS,
  UNIDADE_LABELS,
  INGREDIENTE_CATEGORIAS,
  UNIDADES_PADRAO,
} from "@kph/db/types/compras-ingredientes";

// ── KPI Card ──────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "neutral" | "warn" | "danger";
  icon?: React.ReactNode;
}) {
  const fg =
    tone === "danger" ? "#B91C1C" : tone === "warn" ? "#A16207" : "var(--text)";
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
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          color: "var(--text-3)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.6,
        }}
      >
        {icon}
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: fg,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {hint && <div style={{ fontSize: 11, color: "var(--text-3)" }}>{hint}</div>}
    </div>
  );
}

// ── Category badge ────────────────────────────────────────────

const CATEGORIA_COLORS: Record<IngredienteCategoria, string> = {
  proteina: "#7C3AED",
  verdura: "#15803D",
  legume: "#16A34A",
  fruta: "#D97706",
  graos: "#B45309",
  laticinios: "#0284C7",
  panificacao: "#92400E",
  bebida_alcoolica: "#7C2D12",
  bebida_nao_alcoolica: "#0369A1",
  tempero: "#9A3412",
  oleo_gordura: "#854D0E",
  descartavel: "#374151",
  limpeza: "#1E40AF",
  outro: "#6B7280",
};

function CategoriaBadge({ cat }: { cat: IngredienteCategoria }) {
  const color = CATEGORIA_COLORS[cat] ?? "#6B7280";
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
      {CATEGORIA_LABELS[cat]}
    </span>
  );
}

// ── Modal Form ────────────────────────────────────────────────

type SupplierOption = { id: string; nome: string };

type FormDraft = {
  nome: string;
  categoria: IngredienteCategoria | "";
  unidade_padrao: UnidadePadrao | "";
  custo_padrao: string;
  codigo: string;
  perdas_padrao: string;
  fornecedor_id: string;
  observacoes: string;
  ativo: boolean;
};

function emptyDraft(): FormDraft {
  return {
    nome: "",
    categoria: "",
    unidade_padrao: "",
    custo_padrao: "",
    codigo: "",
    perdas_padrao: "",
    fornecedor_id: "",
    observacoes: "",
    ativo: true,
  };
}

function draftFromIngredient(ing: Ingredient): FormDraft {
  return {
    nome: ing.nome,
    categoria: ing.categoria,
    unidade_padrao: ing.unidade_padrao,
    custo_padrao: ing.custo_padrao,
    codigo: ing.codigo ?? "",
    perdas_padrao: ing.perdas_padrao ?? "",
    fornecedor_id: ing.fornecedor_id ?? "",
    observacoes: ing.observacoes ?? "",
    ativo: ing.ativo,
  };
}

function IngredientModal({
  open,
  onClose,
  editing,
  groupId,
  suppliers,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: Ingredient | null;
  groupId: string;
  suppliers: SupplierOption[];
  onSaved: (ing: Ingredient) => void;
}) {
  const [draft, setDraft] = useState<FormDraft>(
    editing ? draftFromIngredient(editing) : emptyDraft(),
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset when modal opens
  useMemo(() => {
    if (open) {
      setDraft(editing ? draftFromIngredient(editing) : emptyDraft());
      setErr(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  function set<K extends keyof FormDraft>(key: K, value: FormDraft[K]) {
    setDraft((p) => ({ ...p, [key]: value }));
    setErr(null);
  }

  async function handleSave() {
    if (!draft.nome.trim()) { setErr("Nome obrigatório"); return; }
    if (!draft.categoria) { setErr("Categoria obrigatória"); return; }
    if (!draft.unidade_padrao) { setErr("Unidade obrigatória"); return; }

    setSaving(true);
    let result;

    if (editing) {
      const patch: IngredientUpdate = {
        nome: draft.nome.trim(),
        categoria: draft.categoria as IngredienteCategoria,
        unidade_padrao: draft.unidade_padrao as UnidadePadrao,
        custo_padrao: Number(draft.custo_padrao.replace(",", ".")) || 0,
        codigo: draft.codigo.trim() || null,
        fornecedor_id: draft.fornecedor_id || null,
        perdas_padrao: draft.perdas_padrao !== "" ? Number(draft.perdas_padrao.replace(",", ".")) : null,
        observacoes: draft.observacoes.trim() || null,
        ativo: draft.ativo,
      };
      result = await updateIngredient(editing.id, patch);
    } else {
      const insert: Omit<IngredientInsert, "group_id"> = {
        nome: draft.nome.trim(),
        categoria: draft.categoria as IngredienteCategoria,
        unidade_padrao: draft.unidade_padrao as UnidadePadrao,
        custo_padrao: Number(draft.custo_padrao.replace(",", ".")) || 0,
        codigo: draft.codigo.trim() || null,
        fornecedor_id: draft.fornecedor_id || null,
        perdas_padrao: draft.perdas_padrao !== "" ? Number(draft.perdas_padrao.replace(",", ".")) : null,
        observacoes: draft.observacoes.trim() || null,
        ativo: draft.ativo,
      };
      result = await createIngredient(insert);
    }

    setSaving(false);
    if (!result.ok) { setErr(result.error); return; }
    onSaved(result.data);
    onClose();
  }

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    height: 36,
    fontSize: 13,
    padding: "0 10px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text)",
    outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-3)",
    marginBottom: 4,
    display: "block",
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent style={{ maxWidth: 520 }}>
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 700 }}>
            {editing ? "Editar Ingrediente" : "Novo Ingrediente"}
          </DialogTitle>
        </DialogHeader>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 4 }}>
          {/* Nome */}
          <div>
            <label style={labelStyle}>Nome *</label>
            <input
              style={fieldStyle}
              value={draft.nome}
              onChange={(e) => set("nome", e.target.value)}
              placeholder="Ex: Frango peito"
              autoFocus
            />
          </div>

          {/* Categoria + Unidade */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Categoria *</label>
              <select
                style={{ ...fieldStyle, appearance: "none" }}
                value={draft.categoria}
                onChange={(e) => set("categoria", e.target.value as IngredienteCategoria)}
              >
                <option value="">Selecione…</option>
                {INGREDIENTE_CATEGORIAS.map((c) => (
                  <option key={c} value={c}>{CATEGORIA_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Unidade padrão *</label>
              <select
                style={{ ...fieldStyle, appearance: "none" }}
                value={draft.unidade_padrao}
                onChange={(e) => set("unidade_padrao", e.target.value as UnidadePadrao)}
              >
                <option value="">Selecione…</option>
                {UNIDADES_PADRAO.map((u) => (
                  <option key={u} value={u}>{UNIDADE_LABELS[u]} ({u})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Custo + Perdas */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Custo padrão (R$/unidade)</label>
              <input
                style={{ ...fieldStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                value={draft.custo_padrao}
                onChange={(e) => set("custo_padrao", e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div>
              <label style={labelStyle}>Perda padrão (%)</label>
              <input
                style={{ ...fieldStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                value={draft.perdas_padrao}
                onChange={(e) => set("perdas_padrao", e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          {/* Código + Fornecedor */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Código interno</label>
              <input
                style={fieldStyle}
                value={draft.codigo}
                onChange={(e) => set("codigo", e.target.value)}
                placeholder="Ex: PROT-001"
              />
            </div>
            <div>
              <label style={labelStyle}>Fornecedor</label>
              <select
                style={{ ...fieldStyle, appearance: "none" }}
                value={draft.fornecedor_id}
                onChange={(e) => set("fornecedor_id", e.target.value)}
              >
                <option value="">Nenhum</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Observações */}
          <div>
            <label style={labelStyle}>Observações</label>
            <textarea
              style={{
                ...fieldStyle,
                height: 72,
                resize: "vertical",
                padding: "8px 10px",
              }}
              value={draft.observacoes}
              onChange={(e) => set("observacoes", e.target.value)}
              placeholder="Fornecedor preferido, características, etc."
            />
          </div>

          {/* Status */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: "var(--text-2)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={draft.ativo}
              onChange={(e) => set("ativo", e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            Ingrediente ativo
          </label>

          {/* Error */}
          {err && (
            <div
              style={{
                padding: "8px 12px",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 8,
                fontSize: 12,
                color: "#B91C1C",
              }}
            >
              {err}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando…" : editing ? "Salvar alterações" : "Criar ingrediente"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────

export function IngredientsClient({
  ingredients: initialIngredients,
  groupId,
  suppliers,
}: {
  ingredients: Ingredient[];
  groupId: string;
  suppliers: SupplierOption[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [ingredients, setIngredients] = useState<Ingredient[]>(initialIngredients);

  const [search, setSearch] = useState("");
  const [categoriaFilter, setCategoriaFilter] = useState<string>("__all__");
  const [statusFilter, setStatusFilter] = useState<"ativos" | "inativos" | "todos">("ativos");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);

  const supplierMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of suppliers) m[s.id] = s.nome;
    return m;
  }, [suppliers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ingredients.filter((ing) => {
      if (statusFilter === "ativos" && !ing.ativo) return false;
      if (statusFilter === "inativos" && ing.ativo) return false;
      if (categoriaFilter !== "__all__" && ing.categoria !== categoriaFilter) return false;
      if (q) {
        const hay = `${ing.nome} ${ing.codigo ?? ""} ${CATEGORIA_LABELS[ing.categoria]}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [ingredients, search, categoriaFilter, statusFilter]);

  const kpis = useMemo(() => {
    const ativos = ingredients.filter((i) => i.ativo);
    const semFornecedor = ativos.filter((i) => !i.fornecedor_id).length;
    const categorias = new Set(ativos.map((i) => i.categoria)).size;
    const custos = ativos.map((i) => Number(i.custo_padrao)).filter((n) => n > 0);
    const custoMedio = custos.length > 0
      ? custos.reduce((a, b) => a + b, 0) / custos.length
      : 0;
    return { total: ativos.length, semFornecedor, categorias, custoMedio };
  }, [ingredients]);

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(ing: Ingredient) {
    setEditing(ing);
    setModalOpen(true);
  }

  function handleSaved(ing: Ingredient) {
    setIngredients((prev) => {
      const idx = prev.findIndex((x) => x.id === ing.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = ing;
        return next;
      }
      return [ing, ...prev];
    });
    startTransition(() => router.refresh());
  }

  function handleToggle(id: string) {
    startTransition(async () => {
      const r = await toggleIngredientAtivo(id);
      if (r.ok) {
        setIngredients((prev) => prev.map((x) => (x.id === id ? r.data : x)));
        router.refresh();
      }
    });
  }

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto" }}>
      {/* Header */}
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
            Compras · Ingredientes
          </div>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 700,
              margin: "6px 0 4px",
              color: "var(--text)",
              letterSpacing: -0.4,
            }}
          >
            Ingredientes
          </h1>
          <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0, maxWidth: 600 }}>
            Cadastro centralizado de insumos. O custo padrão propaga automaticamente para todas as fichas técnicas vinculadas.
          </p>
        </div>
        <Button onClick={openNew} style={{ gap: 6 }}>
          <Plus size={15} />
          Novo Ingrediente
        </Button>
      </header>

      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gap: 10,
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          marginBottom: 20,
        }}
      >
        <KpiCard
          label="Total ativos"
          value={kpis.total}
          icon={<Carrot size={12} />}
          hint="Ingredientes cadastrados"
        />
        <KpiCard
          label="Categorias"
          value={kpis.categorias}
          icon={<Check size={12} />}
          hint="Diversidade de insumos"
        />
        <KpiCard
          label="Sem fornecedor"
          value={kpis.semFornecedor}
          icon={<AlertTriangle size={12} />}
          tone={kpis.semFornecedor > 0 ? "warn" : "neutral"}
          hint={kpis.semFornecedor > 0 ? "Associe um fornecedor" : "Todos vinculados"}
        />
        <KpiCard
          label="Custo médio"
          value={kpis.custoMedio > 0 ? formatBRL(kpis.custoMedio) : "—"}
          hint="Média por unidade (ativos)"
        />
      </div>

      {/* Toolbar */}
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
            placeholder="Buscar nome, código, categoria…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 30 }}
          />
        </div>

        <Select
          value={categoriaFilter}
          onValueChange={(v) => setCategoriaFilter(v ?? "__all__")}
        >
          <SelectTrigger style={{ minWidth: 180 }}>
            <SelectValue>
              {categoriaFilter === "__all__"
                ? "Todas as categorias"
                : CATEGORIA_LABELS[categoriaFilter as IngredienteCategoria] ?? categoriaFilter}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas as categorias</SelectItem>
            {INGREDIENTE_CATEGORIAS.map((c) => (
              <SelectItem key={c} value={c}>{CATEGORIA_LABELS[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(v) => v && setStatusFilter(v as typeof statusFilter)}
        >
          <SelectTrigger style={{ minWidth: 120 }}>
            <SelectValue>
              {{ ativos: "Ativos", inativos: "Inativos", todos: "Todos" }[statusFilter]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ativos">Ativos</SelectItem>
            <SelectItem value="inativos">Inativos</SelectItem>
            <SelectItem value="todos">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: "56px 24px", textAlign: "center" }}>
            <Carrot size={32} style={{ color: "var(--text-3)", marginBottom: 10 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
              Nenhum ingrediente encontrado
            </div>
            <p style={{ fontSize: 12, color: "var(--text-3)", margin: "6px 0 16px" }}>
              {ingredients.length === 0
                ? "Cadastre o primeiro ingrediente pra começar."
                : "Nenhum resultado pros filtros atuais."}
            </p>
            {ingredients.length === 0 && (
              <button onClick={openNew} className={buttonVariants()}>
                Novo Ingrediente
              </button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead style={{ textAlign: "center" }}>Unidade</TableHead>
                <TableHead style={{ textAlign: "right" }}>Custo padrão</TableHead>
                <TableHead style={{ textAlign: "right" }}>Perda %</TableHead>
                <TableHead style={{ textAlign: "center" }}>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((ing) => (
                <TableRow key={ing.id}>
                  <TableCell>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                      {ing.nome}
                    </div>
                    {ing.codigo && (
                      <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                        #{ing.codigo}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <CategoriaBadge cat={ing.categoria} />
                  </TableCell>
                  <TableCell>
                    <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                      {ing.fornecedor_id ? (supplierMap[ing.fornecedor_id] ?? "—") : "—"}
                    </span>
                  </TableCell>
                  <TableCell style={{ textAlign: "center" }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--text-2)",
                        fontVariantNumeric: "tabular-nums",
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                      }}
                    >
                      {ing.unidade_padrao}
                    </span>
                  </TableCell>
                  <TableCell
                    style={{
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {Number(ing.custo_padrao) > 0 ? formatBRL(Number(ing.custo_padrao)) : (
                      <span style={{ color: "var(--text-3)" }}>—</span>
                    )}
                  </TableCell>
                  <TableCell
                    style={{
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      fontSize: 12,
                      color: "var(--text-3)",
                    }}
                  >
                    {Number(ing.perdas_padrao ?? 0) > 0
                      ? `${Number(ing.perdas_padrao).toFixed(1)}%`
                      : "—"}
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
                        background: ing.ativo ? "rgba(34,197,94,0.12)" : "var(--surface-2)",
                        color: ing.ativo ? "#22C55E" : "var(--text-3)",
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 99,
                          background: ing.ativo ? "#22C55E" : "var(--text-3)",
                        }}
                      />
                      {ing.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </TableCell>
                  <TableCell style={{ textAlign: "right" }}>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className={buttonVariants({ variant: "ghost", size: "icon" })}
                        aria-label="Ações"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(ing)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggle(ing.id)}>
                          <Power className="mr-2 h-4 w-4" />
                          {ing.ativo ? "Desativar" : "Ativar"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-3)" }}>
        {filtered.length} de {ingredients.length} ingrediente{ingredients.length !== 1 ? "s" : ""}
      </div>

      {/* Modal */}
      <IngredientModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        groupId={groupId}
        suppliers={suppliers}
        onSaved={handleSaved}
      />
    </div>
  );
}
