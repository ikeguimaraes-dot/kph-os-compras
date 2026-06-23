"use client";

import { useRef, useState } from "react";
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@kph/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@kph/ui/dialog";
import { useUnit } from "@kph/auth/context";
import { formatBRL } from "@/lib/format";
import { parseFichas, type ParsedFichas, type TextItemLike } from "@/lib/cardapio/parse-fichas";

const API_BASE =
  process.env.NEXT_PUBLIC_COMPRAS_URL ?? "https://kph-os-compras.vercel.app";

type Stage = "idle" | "parsing" | "preview" | "importing" | "done" | "error";

interface Divergencia {
  codigo: string;
  nome: string;
  declarado: number;
  calculado: number;
  diff: number;
}

interface Reconcile {
  ok: number;
  total: number;
  divergentes: Divergencia[];
}

interface ImportReport {
  menuItems: { inserted: number; updated: number; deactivated: number };
  ingredients: { inserted: number; updated: number; linked: number };
  recipeLines: number;
  reconcile: Reconcile;
}

// Reconciliação client-side (mesma fórmula do servidor): preview antes de gravar.
function reconcile(parsed: ParsedFichas): Reconcile {
  const byProd = new Map<string, ParsedFichas["linhas"]>();
  for (const l of parsed.linhas) {
    const arr = byProd.get(l.produto) ?? [];
    arr.push(l);
    byProd.set(l.produto, arr);
  }
  const divergentes: Divergencia[] = [];
  let ok = 0;
  for (const p of parsed.produtos) {
    const ls = byProd.get(p.codigo) ?? [];
    // custo_total = Σ(q·cu) (rodapé "Custo dos Insumos"); sem × rendimento.
    const sum = ls.reduce((s, l) => s + l.quantidade * l.custo_unitario, 0);
    if (Math.abs(sum - p.custo_total) <= 0.02) {
      ok++;
    } else {
      divergentes.push({
        codigo: p.codigo,
        nome: p.nome,
        declarado: Math.round(p.custo_total * 100) / 100,
        calculado: Math.round(sum * 100) / 100,
        diff: Math.round((sum - p.custo_total) * 100) / 100,
      });
    }
  }
  return { ok, total: parsed.produtos.length, divergentes };
}

async function parsePdfInBrowser(file: File): Promise<ParsedFichas> {
  const pdfjs = await import("pdfjs-dist");
  // Worker do pdf.js — plumbing do bundler (Turbopack/Webpack resolvem a URL).
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages: TextItemLike[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items: TextItemLike[] = [];
    for (const it of content.items) {
      if (!("str" in it)) continue; // ignora TextMarkedContent
      items.push({ str: it.str, transform: it.transform, width: it.width, height: it.height });
    }
    pages.push(items);
  }
  return parseFichas(pages);
}

export function ImportDialog({
  open,
  onClose,
  onImported,
  defaultUnitId,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  defaultUnitId: string | null;
}) {
  const { units } = useUnit();
  const [stage, setStage] = useState<Stage>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedFichas | null>(null);
  const [preview, setPreview] = useState<Reconcile | null>(null);
  const [targetUnit, setTargetUnit] = useState<string>(defaultUnitId ?? "");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStage("idle");
    setFileName(null);
    setParsed(null);
    setPreview(null);
    setReport(null);
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    setStage("parsing");
    setError(null);
    try {
      const result = await parsePdfInBrowser(file);
      if (result.produtos.length === 0) {
        setError("Nenhuma ficha encontrada no PDF. Confira se é o arquivo do Everest.");
        setStage("error");
        return;
      }
      setParsed(result);
      setPreview(reconcile(result));
      setStage("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao ler o PDF");
      setStage("error");
    }
  }

  async function handleConfirm() {
    if (!parsed || !targetUnit) return;
    setStage("importing");
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/cardapio/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId: targetUnit, parsed, dryRun: false }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? `Erro ${res.status}`);
        setStage("error");
        return;
      }
      setReport(data as ImportReport);
      setStage("done");
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no import");
      setStage("error");
    }
  }

  const unitName = units.find((u) => u.id === targetUnit)?.name ?? "—";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent style={{ maxWidth: 620 }}>
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 700 }}>
            Importar ficha técnica (PDF)
          </DialogTitle>
        </DialogHeader>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 4 }}>
          {/* Dropzone / file picker */}
          {(stage === "idle" || stage === "parsing" || stage === "error") && (
            <div>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <button
                onClick={() => inputRef.current?.click()}
                disabled={stage === "parsing"}
                style={{
                  width: "100%",
                  padding: "32px 16px",
                  border: "1.5px dashed var(--border)",
                  borderRadius: 12,
                  background: "var(--surface-2, var(--surface))",
                  color: "var(--text-2)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  cursor: stage === "parsing" ? "wait" : "pointer",
                }}
              >
                {stage === "parsing" ? (
                  <>
                    <Loader2 size={28} className="animate-spin" />
                    <span style={{ fontSize: 13 }}>Lendo {fileName}… (parse no navegador)</span>
                  </>
                ) : (
                  <>
                    <UploadCloud size={28} style={{ color: "var(--text-3)" }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                      Selecionar PDF do Everest
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                      O arquivo é processado no seu navegador — só o resultado vai pro servidor.
                    </span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Preview de reconciliação */}
          {stage === "preview" && parsed && preview && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 10,
                }}
              >
                <Stat label="Fichas" value={parsed.produtos.length} />
                <Stat label="Insumos" value={parsed.insumos.length} />
                <Stat label="Linhas" value={parsed.linhas.length} />
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background:
                    preview.divergentes.length === 0
                      ? "rgba(34,197,94,0.1)"
                      : "rgba(234,179,8,0.1)",
                  color: preview.divergentes.length === 0 ? "#16A34A" : "#A16207",
                  fontSize: 13,
                }}
              >
                {preview.divergentes.length === 0 ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <AlertTriangle size={16} />
                )}
                <span>
                  {preview.ok}/{preview.total} fichas reconciliam
                  {preview.divergentes.length > 0
                    ? ` · ${preview.divergentes.length} divergem`
                    : ""}
                </span>
              </div>

              {preview.divergentes.length > 0 && (
                <div
                  style={{
                    maxHeight: 160,
                    overflowY: "auto",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                >
                  {preview.divergentes.slice(0, 50).map((d) => (
                    <div
                      key={d.codigo}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                        padding: "6px 10px",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <span style={{ color: "var(--text-2)" }}>
                        <span style={{ color: "var(--text-3)" }}>#{d.codigo}</span> {d.nome}
                      </span>
                      <span style={{ color: "var(--text-3)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                        {formatBRL(d.declarado)} → {formatBRL(d.calculado)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Unidade de destino */}
              <div>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-3)",
                    marginBottom: 4,
                    display: "block",
                  }}
                >
                  Importar para a unidade
                </label>
                <select
                  value={targetUnit}
                  onChange={(e) => setTargetUnit(e.target.value)}
                  style={{
                    width: "100%",
                    height: 38,
                    fontSize: 13,
                    padding: "0 10px",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--text)",
                  }}
                >
                  {units.length === 0 && <option value="">—</option>}
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Importando */}
          {stage === "importing" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "24px 12px",
                justifyContent: "center",
                color: "var(--text-2)",
                fontSize: 13,
              }}
            >
              <Loader2 size={20} className="animate-spin" />
              Gravando em {unitName}… (upsert idempotente)
            </div>
          )}

          {/* Relatório final */}
          {stage === "done" && report && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: "#16A34A",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                <CheckCircle2 size={18} /> Import concluído
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--text-2)", lineHeight: 1.7 }}>
                <li>
                  Fichas: <b>{report.menuItems.inserted}</b> novas, <b>{report.menuItems.updated}</b> atualizadas,{" "}
                  <b>{report.menuItems.deactivated}</b> desativadas
                </li>
                <li>
                  Insumos: <b>{report.ingredients.inserted}</b> novos, <b>{report.ingredients.updated}</b> atualizados,{" "}
                  <b>{report.ingredients.linked}</b> ligados a subprodutos
                </li>
                <li>
                  Linhas de receita: <b>{report.recipeLines}</b>
                </li>
                <li>
                  Reconciliação: <b>{report.reconcile.ok}/{report.reconcile.total}</b>
                </li>
              </ul>
            </div>
          )}

          {/* Erro */}
          {error && (
            <div
              style={{
                padding: "8px 12px",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 8,
                fontSize: 12,
                color: "#B91C1C",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <FileText size={14} /> {error}
            </div>
          )}

          {/* Ações */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4 }}>
            {stage === "done" ? (
              <Button onClick={handleClose}>Fechar</Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleClose} disabled={stage === "importing"}>
                  Cancelar
                </Button>
                {stage === "preview" && (
                  <Button onClick={handleConfirm} disabled={!targetUnit}>
                    Confirmar import para {unitName}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "10px 12px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
        {value.toLocaleString("pt-BR")}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
    </div>
  );
}
