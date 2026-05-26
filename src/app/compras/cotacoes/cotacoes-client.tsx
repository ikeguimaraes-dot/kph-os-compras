"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";

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
  DialogTrigger,
} from "@kph/ui/dialog";
import { Textarea } from "@kph/ui/textarea";
import { formatBRL } from "@/lib/format";
import type { PriceQuoteRow, PriceQuoteItemRow, QuoteStatus } from "@kph/db/types/database";

import {
  createQuote,
  createQuoteItem,
  deleteQuoteItem,
  listQuoteItems,
  updateQuoteStatus,
} from "./actions";
import type { QuoteWithMeta } from "./actions";

interface Props {
  unitId: string;
  quotes: QuoteWithMeta[];
  suppliers: { id: string; nome: string }[];
  defaultMes: number;
  defaultAno: number;
}

const STATUS_STYLE: Record<QuoteStatus, { bg: string; fg: string; label: string }> = {
  rascunho:  { bg: "rgba(100,116,139,0.14)", fg: "#475569", label: "Rascunho" },
  enviada:   { bg: "rgba(59,130,246,0.16)",  fg: "#1D4ED8", label: "Enviada" },
  recebida:  { bg: "rgba(245,158,11,0.16)",  fg: "#A16207", label: "Recebida" },
  aprovada:  { bg: "rgba(34,197,94,0.16)",   fg: "#15803D", label: "Aprovada" },
  cancelada: { bg: "rgba(239,68,68,0.16)",   fg: "#B91C1C", label: "Cancelada" },
};

const STATUS_FLOW: Partial<Record<QuoteStatus, QuoteStatus>> = {
  rascunho: "enviada",
  enviada: "recebida",
  recebida: "aprovada",
};

function formatPeriodo(periodo: string): string {
  const d = new Date(periodo + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

function defaultMonthValue(mes: number, ano: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

export function CotacoesClient({ unitId, quotes: initialQuotes, suppliers, defaultMes, defaultAno }: Props) {
  const [rows, setRows] = useState<QuoteWithMeta[]>(initialQuotes);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [itemsCache, setItemsCache] = useState<Record<string, PriceQuoteItemRow[]>>({});
  const [pending, startTransition] = useTransition();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [formTitulo, setFormTitulo] = useState("");
  const [formSupplier, setFormSupplier] = useState("__none__");
  const [formPeriodo, setFormPeriodo] = useState(defaultMonthValue(defaultMes, defaultAno));
  const [formObs, setFormObs] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);

  const [addItemForms, setAddItemForms] = useState<Record<string, { descricao: string; unidade: string; quantidade: string; preco: string }>>({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (q) {
        const titulo = (r.titulo ?? "").toLowerCase();
        const nome = (r.supplier_nome ?? "").toLowerCase();
        if (!titulo.includes(q) && !nome.includes(q)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, search]);

  const kpiTotal = filtered.length;
  const kpiAguardando = filtered.filter((r) => r.status === "enviada" || r.status === "recebida").length;
  const kpiValor = filtered.reduce((acc, r) => acc + (r.total_valor ?? 0), 0);

  function handleRowClick(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!itemsCache[id]) {
      startTransition(async () => {
        const items = await listQuoteItems(id);
        setItemsCache((prev) => ({ ...prev, [id]: items }));
      });
    }
  }

  function handleAdvance(e: React.MouseEvent, q: QuoteWithMeta) {
    e.stopPropagation();
    const next = STATUS_FLOW[q.status];
    if (!next) return;
    startTransition(async () => {
      const res = await updateQuoteStatus(q.id, next);
      if (res.ok) {
        setRows((prev) => prev.map((r) => r.id === q.id ? { ...r, status: next } : r));
      }
    });
  }

  async function handleCreateQuote(e: React.FormEvent) {
    e.preventDefault();
    setFormSubmitting(true);
    const res = await createQuote({
      unit_id: unitId,
      supplier_id: formSupplier === "__none__" ? null : formSupplier,
      periodo: formPeriodo + "-01",
      status: "rascunho",
      titulo: formTitulo.trim() || null,
      observacoes: formObs.trim() || null,
      created_by: null,
    });
    setFormSubmitting(false);
    if (res.ok) {
      const supplierNome = suppliers.find((s) => s.id === formSupplier)?.nome ?? null;
      const newRow: QuoteWithMeta = {
        ...res.data,
        supplier_nome: supplierNome,
        total_itens: 0,
        total_valor: 0,
      };
      setRows((prev) => [newRow, ...prev]);
      setDialogOpen(false);
      setFormTitulo("");
      setFormSupplier("__none__");
      setFormPeriodo(defaultMonthValue(defaultMes, defaultAno));
      setFormObs("");
    }
  }

  function getAddItemForm(quoteId: string) {
    return addItemForms[quoteId] ?? { descricao: "", unidade: "kg", quantidade: "", preco: "" };
  }

  function setAddItemField(quoteId: string, field: string, value: string) {
    setAddItemForms((prev) => ({
      ...prev,
      [quoteId]: { ...getAddItemForm(quoteId), [field]: value },
    }));
  }

  function handleAddItem(e: React.FormEvent, quoteId: string) {
    e.preventDefault();
    const form = getAddItemForm(quoteId);
    if (!form.descricao.trim() || !form.quantidade) return;
    startTransition(async () => {
      const res = await createQuoteItem({
        quote_id: quoteId,
        descricao: form.descricao.trim(),
        unidade: form.unidade.trim() || "kg",
        quantidade: Number(form.quantidade),
        preco_unitario: form.preco ? Number(form.preco) : null,
        observacoes: null,
      });
      if (res.ok) {
        setItemsCache((prev) => ({
          ...prev,
          [quoteId]: [...(prev[quoteId] ?? []), res.data],
        }));
        const preco = form.preco ? Number(form.preco) : null;
        const qty = Number(form.quantidade);
        const itemTotal = preco != null ? preco * qty : null;
        setRows((prev) => prev.map((r) => {
          if (r.id !== quoteId) return r;
          return {
            ...r,
            total_itens: r.total_itens + 1,
            total_valor: (r.total_valor ?? 0) + (itemTotal ?? 0),
          };
        }));
        setAddItemForms((prev) => ({ ...prev, [quoteId]: { descricao: "", unidade: "kg", quantidade: "", preco: "" } }));
      }
    });
  }

  function handleDeleteItem(quoteId: string, itemId: string) {
    const item = itemsCache[quoteId]?.find((i) => i.id === itemId);
    startTransition(async () => {
      const res = await deleteQuoteItem(itemId);
      if (res.ok) {
        setItemsCache((prev) => ({
          ...prev,
          [quoteId]: (prev[quoteId] ?? []).filter((i) => i.id !== itemId),
        }));
        if (item) {
          setRows((prev) => prev.map((r) => {
            if (r.id !== quoteId) return r;
            return {
              ...r,
              total_itens: Math.max(0, r.total_itens - 1),
              total_valor: (r.total_valor ?? 0) - (item.total ?? 0),
            };
          }));
        }
      }
    });
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "14px 18px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--text-3)", marginBottom: 6 }}>Total de cotações</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>{kpiTotal}</div>
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "14px 18px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--text-3)", marginBottom: 6 }}>Enviadas / Aguardando</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>{kpiAguardando}</div>
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "14px 18px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--text-3)", marginBottom: 6 }}>Total estimado</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>{formatBRL(kpiValor)}</div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <Select value={statusFilter} onValueChange={(v: string | null) => setStatusFilter(v ?? "all")}>
          <SelectTrigger style={{ minWidth: 140 }}>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="rascunho">Rascunho</SelectItem>
            <SelectItem value="enviada">Enviada</SelectItem>
            <SelectItem value="recebida">Recebida</SelectItem>
            <SelectItem value="aprovada">Aprovada</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
          </SelectContent>
        </Select>

        <Input
          placeholder="Buscar por título ou fornecedor…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 180, maxWidth: 320 }}
        />

        <div style={{ marginLeft: "auto" }}>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger render={<Button />}>+ Nova Cotação</DialogTrigger>
            <DialogContent style={{ maxWidth: 480 }}>
              <DialogHeader>
                <DialogTitle>Nova Cotação</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateQuote} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 4 }}>Título (opcional)</label>
                  <Input
                    placeholder="Ex: Cotação semana 18"
                    value={formTitulo}
                    onChange={(e) => setFormTitulo(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 4 }}>Fornecedor (opcional)</label>
                  <Select value={formSupplier} onValueChange={(v: string | null) => setFormSupplier(v ?? "__none__")}>
                    <SelectTrigger style={{ width: "100%" }}>
                      <SelectValue placeholder="Sem fornecedor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sem fornecedor</SelectItem>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 4 }}>Período</label>
                  <input
                    type="month"
                    required
                    value={formPeriodo}
                    onChange={(e) => setFormPeriodo(e.target.value)}
                    style={{ height: 32, width: "100%", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", padding: "0 10px", fontSize: 14, color: "var(--text)", outline: "none" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 4 }}>Observações (opcional)</label>
                  <Textarea
                    placeholder="Detalhes adicionais…"
                    value={formObs}
                    onChange={(e) => setFormObs(e.target.value)}
                    style={{ minHeight: 64 }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={formSubmitting}>{formSubmitting ? "Criando…" : "Criar cotação"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "40px 22px", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
            Nenhuma cotação encontrada.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={{ width: 24 }} />
                <TableHead>Título</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Período</TableHead>
                <TableHead className="text-right">Itens</TableHead>
                <TableHead className="text-right">Total Est.</TableHead>
                <TableHead>Status</TableHead>
                <TableHead style={{ width: 90 }} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((q) => {
                const isExpanded = expandedId === q.id;
                const items = itemsCache[q.id] ?? [];
                const nextStatus = STATUS_FLOW[q.status];
                const style = STATUS_STYLE[q.status];
                const addForm = getAddItemForm(q.id);

                return (
                  <Fragment key={q.id}>
                    <TableRow
                      onClick={() => handleRowClick(q.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <TableCell>
                        {isExpanded
                          ? <ChevronDown size={14} style={{ color: "var(--text-3)" }} />
                          : <ChevronRight size={14} style={{ color: "var(--text-3)" }} />
                        }
                      </TableCell>
                      <TableCell style={{ fontWeight: 500, color: "var(--text)" }}>
                        {q.titulo ?? "Sem título"}
                      </TableCell>
                      <TableCell style={{ color: "var(--text-2)", fontSize: 13 }}>
                        {q.supplier_nome ?? "—"}
                      </TableCell>
                      <TableCell style={{ color: "var(--text-2)", fontSize: 13 }}>
                        {formatPeriodo(q.periodo)}
                      </TableCell>
                      <TableCell className="text-right" style={{ color: "var(--text-2)", fontSize: 13 }}>
                        {q.total_itens}
                      </TableCell>
                      <TableCell className="text-right" style={{ color: "var(--text-2)", fontSize: 13 }}>
                        {q.total_valor != null ? formatBRL(q.total_valor) : "—"}
                      </TableCell>
                      <TableCell>
                        <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: style.bg, color: style.fg }}>
                          {style.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        {nextStatus && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={pending}
                            onClick={(e) => handleAdvance(e, q)}
                          >
                            Avançar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>

                    {isExpanded && (
                      <TableRow key={q.id + "-expanded"}>
                        <TableCell colSpan={8} style={{ padding: 0 }}>
                          <div style={{ background: "var(--surface)", borderTop: "1px solid var(--border)", padding: "16px 20px" }}>
                            {items.length > 0 ? (
                              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14, fontSize: 13 }}>
                                <thead>
                                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                                    <th style={{ textAlign: "left", padding: "4px 8px", color: "var(--text-3)", fontWeight: 600, fontSize: 11 }}>Descrição</th>
                                    <th style={{ textAlign: "left", padding: "4px 8px", color: "var(--text-3)", fontWeight: 600, fontSize: 11 }}>Unidade</th>
                                    <th style={{ textAlign: "right", padding: "4px 8px", color: "var(--text-3)", fontWeight: 600, fontSize: 11 }}>Qtd</th>
                                    <th style={{ textAlign: "right", padding: "4px 8px", color: "var(--text-3)", fontWeight: 600, fontSize: 11 }}>Preço Unit.</th>
                                    <th style={{ textAlign: "right", padding: "4px 8px", color: "var(--text-3)", fontWeight: 600, fontSize: 11 }}>Total</th>
                                    <th style={{ width: 32 }} />
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map((item) => (
                                    <tr key={item.id} style={{ borderBottom: "1px solid var(--border)" }}>
                                      <td style={{ padding: "6px 8px", color: "var(--text)" }}>{item.descricao}</td>
                                      <td style={{ padding: "6px 8px", color: "var(--text-2)" }}>{item.unidade}</td>
                                      <td style={{ padding: "6px 8px", color: "var(--text-2)", textAlign: "right" }}>{item.quantidade}</td>
                                      <td style={{ padding: "6px 8px", color: "var(--text-2)", textAlign: "right" }}>
                                        {item.preco_unitario != null ? formatBRL(item.preco_unitario) : "—"}
                                      </td>
                                      <td style={{ padding: "6px 8px", color: "var(--text-2)", textAlign: "right" }}>
                                        {item.total != null ? formatBRL(item.total) : "—"}
                                      </td>
                                      <td style={{ padding: "6px 8px", textAlign: "right" }}>
                                        <button
                                          onClick={() => handleDeleteItem(q.id, item.id)}
                                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: 2, display: "flex", alignItems: "center" }}
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 12 }}>Nenhum item ainda.</p>
                            )}

                            <form
                              onSubmit={(e) => handleAddItem(e, q.id)}
                              style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div style={{ flex: 2, minWidth: 140 }}>
                                <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 3 }}>Descrição</label>
                                <Input
                                  placeholder="Ex: Filé mignon"
                                  value={addForm.descricao}
                                  onChange={(e) => setAddItemField(q.id, "descricao", e.target.value)}
                                  required
                                />
                              </div>
                              <div style={{ flex: 1, minWidth: 70 }}>
                                <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 3 }}>Unidade</label>
                                <Input
                                  placeholder="kg"
                                  value={addForm.unidade}
                                  onChange={(e) => setAddItemField(q.id, "unidade", e.target.value)}
                                />
                              </div>
                              <div style={{ flex: 1, minWidth: 70 }}>
                                <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 3 }}>Qtd</label>
                                <Input
                                  type="number"
                                  placeholder="0"
                                  min={0}
                                  step="any"
                                  value={addForm.quantidade}
                                  onChange={(e) => setAddItemField(q.id, "quantidade", e.target.value)}
                                  required
                                />
                              </div>
                              <div style={{ flex: 1, minWidth: 90 }}>
                                <label style={{ fontSize: 11, color: "var(--text-3)", display: "block", marginBottom: 3 }}>Preço unit. (R$)</label>
                                <Input
                                  type="number"
                                  placeholder="opcional"
                                  min={0}
                                  step="any"
                                  value={addForm.preco}
                                  onChange={(e) => setAddItemField(q.id, "preco", e.target.value)}
                                />
                              </div>
                              <Button type="submit" size="sm" style={{ marginBottom: 1 }}>+ Add Item</Button>
                            </form>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
