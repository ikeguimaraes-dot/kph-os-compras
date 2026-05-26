"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
  Truck,
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
  createSupplier,
  deleteSupplier,
  toggleSupplierAtivo,
  updateSupplier,
} from "@/app/compras/actions";
import type { Supplier } from "@/lib/compras/types";

type FormValues = {
  nome: string;
  cnpj: string;
  telefone: string;
  email: string;
  categoria: string;
  ativo: boolean;
};

const EMPTY: FormValues = {
  nome: "",
  cnpj: "",
  telefone: "",
  email: "",
  categoria: "",
  ativo: true,
};

export function FornecedoresClient({
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
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState<{ mode: "create" } | { mode: "edit"; row: Supplier } | null>(null);
  const [form, setForm] = useState<FormValues>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setForm(EMPTY);
    setError(null);
    setShowForm({ mode: "create" });
  }
  function openEdit(row: Supplier) {
    setForm({
      nome: row.nome,
      cnpj: row.cnpj ?? "",
      telefone: row.telefone ?? "",
      email: row.email ?? "",
      categoria: row.categoria ?? "",
      ativo: row.ativo,
    });
    setError(null);
    setShowForm({ mode: "edit", row });
  }

  function handleSave() {
    if (!showForm) return;
    setError(null);
    startTransition(async () => {
      if (showForm.mode === "create") {
        const r = await createSupplier({
          unit_id: unitId,
          brand_id: brandId,
          nome: form.nome.trim(),
          cnpj: form.cnpj.trim() || null,
          telefone: form.telefone.trim() || null,
          email: form.email.trim() || null,
          categoria: form.categoria.trim() || null,
          ativo: form.ativo,
        });
        if (!r.ok) {
          setError(r.error);
          return;
        }
      } else {
        const r = await updateSupplier(showForm.row.id, {
          nome: form.nome.trim(),
          cnpj: form.cnpj.trim() || null,
          telefone: form.telefone.trim() || null,
          email: form.email.trim() || null,
          categoria: form.categoria.trim() || null,
          ativo: form.ativo,
        });
        if (!r.ok) {
          setError(r.error);
          return;
        }
      }
      setShowForm(null);
      router.refresh();
    });
  }

  function handleToggle(id: string) {
    startTransition(async () => {
      await toggleSupplierAtivo(id);
      router.refresh();
    });
  }

  function handleDelete(id: string, nome: string) {
    if (!window.confirm(`Excluir fornecedor "${nome}"? Apenas founders podem deletar.`))
      return;
    startTransition(async () => {
      const r = await deleteSupplier(id);
      if (!r.ok) {
        window.alert(`Falha: ${r.error}`);
        return;
      }
      router.refresh();
    });
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? suppliers.filter((s) =>
        `${s.nome} ${s.cnpj ?? ""} ${s.categoria ?? ""}`.toLowerCase().includes(q),
      )
    : suppliers;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto" }}>
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

      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18,
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
            Compras · Fornecedores
          </div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              margin: "6px 0 4px",
              color: "var(--text)",
              letterSpacing: -0.4,
            }}
          >
            Cadastro de fornecedores
          </h1>
          <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>
            Unidade {unitName} · {suppliers.length} cadastrado
            {suppliers.length === 1 ? "" : "s"}.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Novo fornecedor
        </Button>
      </header>

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
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
            placeholder="Buscar nome, CNPJ, categoria…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 30 }}
          />
        </div>
      </div>

      {suppliers.length === 0 ? (
        <div
          style={{
            padding: "56px 20px",
            textAlign: "center",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
          }}
        >
          <Truck size={32} style={{ color: "var(--text-3)", marginBottom: 8 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
            Nenhum fornecedor cadastrado
          </div>
          <p style={{ fontSize: 12, color: "var(--text-3)", margin: "6px 0 14px" }}>
            Cadastre o primeiro fornecedor pra agilizar pedidos novos.
          </p>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Novo fornecedor
          </Button>
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
                <TableHead>Nome</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead style={{ textAlign: "center" }}>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow
                  key={s.id}
                  onClick={() => openEdit(s)}
                  style={{ cursor: "pointer" }}
                >
                  <TableCell
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text)",
                    }}
                  >
                    {s.nome}
                  </TableCell>
                  <TableCell style={{ fontSize: 12, color: "var(--text-2)" }}>
                    {s.cnpj ?? "—"}
                  </TableCell>
                  <TableCell style={{ fontSize: 12, color: "var(--text-2)" }}>
                    {s.categoria ?? "—"}
                  </TableCell>
                  <TableCell style={{ fontSize: 12, color: "var(--text-2)" }}>
                    {s.telefone ?? "—"}
                  </TableCell>
                  <TableCell style={{ fontSize: 12, color: "var(--text-2)" }}>
                    {s.email ?? "—"}
                  </TableCell>
                  <TableCell style={{ textAlign: "center" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: 99,
                        background: s.ativo
                          ? "rgba(34,197,94,0.12)"
                          : "var(--surface-2)",
                        color: s.ativo ? "#22C55E" : "var(--text-3)",
                      }}
                    >
                      {s.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </TableCell>
                  <TableCell
                    onClick={(e) => e.stopPropagation()}
                    style={{ textAlign: "right" }}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className={buttonVariants({
                          variant: "ghost",
                          size: "icon",
                        })}
                        aria-label="Ações"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(s)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggle(s.id)}>
                          <Power className="mr-2 h-4 w-4" />
                          {s.ativo ? "Desativar" : "Ativar"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(s.id, s.nome)}
                          style={{ color: "var(--destructive)" }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!showForm} onOpenChange={(v) => !v && setShowForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {showForm?.mode === "edit" ? "Editar fornecedor" : "Novo fornecedor"}
            </DialogTitle>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <DialogField label="Nome *">
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Nome do fornecedor"
              />
            </DialogField>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <DialogField label="CNPJ">
                <Input
                  value={form.cnpj}
                  onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                  placeholder="00.000.000/0000-00"
                />
              </DialogField>
              <DialogField label="Categoria">
                <Input
                  value={form.categoria}
                  onChange={(e) =>
                    setForm({ ...form, categoria: e.target.value })
                  }
                  placeholder="Ex: Hortifruti"
                />
              </DialogField>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <DialogField label="Telefone">
                <Input
                  value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  placeholder="(00) 00000-0000"
                />
              </DialogField>
              <DialogField label="Email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="contato@fornecedor.com"
                />
              </DialogField>
            </div>
            <DialogField label="Status">
              <button
                type="button"
                onClick={() => setForm({ ...form, ativo: !form.ativo })}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  background: form.ativo ? "rgba(34,197,94,0.12)" : "var(--surface-2)",
                  border: `1px solid ${form.ativo ? "rgba(34,197,94,0.40)" : "var(--border)"}`,
                  borderRadius: 8,
                  color: form.ativo ? "#15803D" : "var(--text-2)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  width: "fit-content",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 99,
                    background: form.ativo ? "#22C55E" : "var(--text-3)",
                  }}
                />
                {form.ativo ? "Ativo" : "Inativo"}
              </button>
            </DialogField>

            {error && (
              <div
                style={{
                  padding: "8px 10px",
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

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 6,
              }}
            >
              <button
                type="button"
                onClick={() => setShowForm(null)}
                className={buttonVariants({ variant: "outline" })}
              >
                Cancelar
              </button>
              <Button onClick={handleSave} disabled={pending || !form.nome.trim()}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DialogField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
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
      </span>
      {children}
    </label>
  );
}
