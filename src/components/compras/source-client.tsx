"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  getSource,
  getSourceDetail,
  saveMenuMetadata,
  type SourceKind,
  type SourceRow,
} from "@/lib/compras/everest-actions";
import "./sources.css";
const labels: Record<string, string> = {
  nome: "Nome",
  documentos: "CNPJ / CPF",
  cadastros: "Cadastros",
  codigo: "Código",
  unidade: "Unidade",
  categoria: "Categoria",
  categoria_everest: "Grupo Everest",
  custo: "Custo Everest",
  rendimento: "Rendimento",
  versao: "Versão",
  preco_venda: "Preço de venda",
  numero: "Número",
  data: "Data",
  total: "Valor da NF",
  situacao: "Situação Everest",
  itens: "Itens",
  valor_ajustado: "Ajuste informado",
  mes: "Mês",
  notas: "Notas",
  ano: "Ano",
  vl_custo_medio: "Custo médio",
  qt_saldo: "Saldo",
  snapshot_em: "Verificação",
  quantidade: "Quantidade",
  aproveitamento: "Aproveitamento (%)",
  vl_total: "Total",
  vl_unitario: "Preço unitário",
  qt_embalagem: "Qtd. embalagem",
  nr_pedido: "Pedido",
  entra_cmv_cfop: "CMV por CFOP",
  descricao_item: "Item",
  unidade_medida: "Unidade",
  quantidade_contada: "Contagem",
  quantidade_convertida: "Convertida",
  saldo_api: "Saldo informado",
  custo_api: "Custo informado",
};
const columns: Record<SourceKind, string[]> = {
  fornecedores: ["nome", "documentos", "cadastros"],
  ingredientes: ["nome", "unidade", "categoria", "custo", "ano", "mes"],
  cardapio: [
    "nome",
    "rendimento",
    "custo",
    "preco_venda",
    "categoria",
    "versao",
  ],
  recebimento: ["numero", "data", "nome", "total", "situacao"],
  estoque: ["data", "nome", "numero", "itens", "situacao"],
  analise: ["mes", "notas", "total"],
};
const titles: Record<SourceKind, string> = {
  fornecedores: "Fornecedores",
  ingredientes: "Ingredientes",
  cardapio: "Cardápio e fichas",
  recebimento: "Notas recebidas",
  estoque: "Inventários",
  analise: "Compras por mês",
};
const brl = (n: unknown) =>
  Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function display(key: string, value: unknown) {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (
    [
      "custo",
      "preco_venda",
      "total",
      "valor_ajustado",
      "vl_custo_medio",
      "vl_total",
      "vl_unitario",
      "custo_api",
    ].includes(key)
  )
    return brl(value);
  if (typeof value === "number") return value.toLocaleString("pt-BR");
  return String(value);
}
export default function SourceClient({
  kind,
  units,
  initialUnit,
  initialId,
}: {
  kind: SourceKind;
  units: { id: string; name: string }[];
  initialUnit: string;
  initialId?: string;
}) {
  const [unit, setUnit] = useState(initialUnit),
    [search, setSearch] = useState(""),
    [month, setMonth] = useState(""),
    [page, setPage] = useState(0);
  const [data, setData] = useState<Awaited<
      ReturnType<typeof getSource>
    > | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Awaited<
      ReturnType<typeof getSourceDetail>
    > | null>(null),
    [detailTitle, setDetailTitle] = useState("");
  const [price, setPrice] = useState(""),
    [category, setCategory] = useState(""),
    [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const sequence = useRef(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      getSource(kind, unit, search, month, page)
        .then((d) => {
          if (alive) setData(d);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [kind, unit, search, month, page]);
  async function open(row: SourceRow) {
    const seq = ++sequence.current;
    setDetailTitle(String(row.nome ?? row.numero ?? "Detalhes"));
    setDetail(null);
    dialog.current?.showModal();
    try {
      const d = await getSourceDetail(kind, unit, row.id);
      if (seq !== sequence.current) return;
      setDetail(d);
      setPrice(String(d.parent?.preco_venda ?? ""));
      setCategory(String(d.parent?.categoria ?? ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na leitura.");
      dialog.current?.close();
    }
  }
  useEffect(() => {
    if (initialId)
      void open({
        id: initialId,
        nome: "Ficha técnica",
      }); /* initial detail is scoped to selected unit */
  }, [initialId]);
  async function save() {
    if (!detail?.parent?.metadata_id) return;
    setSaving(true);
    try {
      await saveMenuMetadata(
        unit,
        String(detail.parent.metadata_id),
        Number(price),
        category,
      );
      setData(await getSource(kind, unit, search, month, page));
      dialog.current?.close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="source-page">
      <nav className="source-nav">
        <Link href="/compras/prisma">Prisma de Compras</Link>
        <Link href="/compras">Pedidos</Link>
        <Link href="/compras/fornecedores">Fornecedores</Link>
        <Link href="/compras/ingredientes">Ingredientes</Link>
        <Link href="/compras/cardapio">Fichas</Link>
        <Link href="/compras/recebimento">Notas</Link>
        <Link href="/compras/estoque">Inventários</Link>
      </nav>
      <p className="source-eyebrow">BASE EVEREST · LEITURA AO VIVO</p>
      <h1>{titles[kind]}</h1>
      <p>
        Dados sincronizados pelo Financeiro. Cadastros, quantidades e custos são
        mantidos no Everest.
      </p>
      <div className="source-filters">
        <label>
          Casa
          <select
            value={unit}
            onChange={(e) => {
              setUnit(e.target.value);
              setPage(0);
            }}
          >
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        {kind !== "analise" && (
          <label>
            Buscar
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Buscar por nome"
            />
          </label>
        )}
        {["recebimento", "estoque", "analise"].includes(kind) && (
          <label>
            Mês (vazio = todo o histórico)
            <input
              type="month"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setPage(0);
              }}
            />
          </label>
        )}
      </div>
      {data?.totals && (
        <div className="source-summary">
          <strong>{data.totals.notas.toLocaleString("pt-BR")} notas</strong>
          <strong>{brl(data.totals.total)}</strong>
          <span>
            Total dos cabeçalhos no período, antes da busca por fornecedor.
            Inclui compras fora de CMV; o Prisma filtra CMV por item.
          </span>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status">Consultando o Everest…</p>
      ) : (
        <>
          <p>{data?.count ?? 0} registros</p>
          <div className="source-scroll">
            <table>
              <thead>
                <tr>
                  {columns[kind].map((k) => (
                    <th key={k}>{labels[k] ?? k}</th>
                  ))}
                  {!["fornecedores", "analise"].includes(kind) && (
                    <th>Detalhes</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {data?.rows.map((r) => (
                  <tr key={r.id}>
                    {columns[kind].map((k) => (
                      <td key={k}>{display(k, r[k])}</td>
                    ))}
                    {!["fornecedores", "analise"].includes(kind) && (
                      <td>
                        <button onClick={() => open(r)}>
                          Ver {kind === "cardapio" ? "ficha" : "itens"}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!data?.rows.length && <p>Nenhum registro encontrado.</p>}
          </div>
          <footer>
            <button disabled={page === 0} onClick={() => setPage((v) => v - 1)}>
              Anterior
            </button>
            <span>Página {page + 1}</span>
            <button
              disabled={(page + 1) * 50 >= (data?.count ?? 0)}
              onClick={() => setPage((v) => v + 1)}
            >
              Próxima
            </button>
          </footer>
        </>
      )}
      <dialog ref={dialog} className="source-dialog">
        <button
          className="source-close"
          aria-label="Fechar detalhes"
          onClick={() => {
            sequence.current++;
            dialog.current?.close();
          }}
        >
          Fechar ×
        </button>
        <h2>{detail?.parent?.nome ?? detailTitle}</h2>
        {!detail ? (
          <p>Carregando…</p>
        ) : (
          <>
            <p>
              {kind === "cardapio"
                ? "Composição do Everest. Quantidades referem-se ao rendimento da ficha; custo do lote: " +
                  display("custo", detail.parent?.custo)
                : "Dados informados pela API do Everest."}
            </p>
            <div className="source-scroll">
              <table>
                <thead>
                  <tr>
                    {Object.keys(detail.rows[0] ?? {})
                      .filter((k) => k !== "id" && k !== "everest_itens")
                      .map((k) => (
                        <th key={k}>{labels[k] ?? k}</th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.rows.map((r) => (
                    <tr key={r.id}>
                      {Object.keys(r)
                        .filter((k) => k !== "id" && k !== "everest_itens")
                        .map((k) => (
                          <td key={k}>{display(k, r[k])}</td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!detail.rows.length && <p>Sem detalhes disponíveis.</p>}
            </div>
            {kind === "cardapio" &&
              (detail.parent?.metadata_id ? (
                <div className="source-filters">
                  <label>
                    Preço de venda
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  </label>
                  <label>
                    Categoria
                    <input
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    />
                  </label>
                  <button
                    disabled={saving || !price || !category.trim()}
                    onClick={save}
                  >
                    {saving ? "Salvando…" : "Salvar preço e categoria"}
                  </button>
                </div>
              ) : (
                <p>
                  Sem cadastro comercial correspondente de forma inequívoca.
                  Preço de venda não estimado.
                </p>
              ))}
          </>
        )}
      </dialog>
    </section>
  );
}
