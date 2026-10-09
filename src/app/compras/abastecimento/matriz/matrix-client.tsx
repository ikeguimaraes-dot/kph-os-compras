"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getBrandMatrix,
  saveQuote,
  searchSupplyItems,
  linkMatrixItem,
} from "@/lib/compras/abastecimento-actions";
import { DISTRIBUIDORES } from "@/lib/compras/abastecimento-engine";
import "../supply.css";
export default function MatrixClient() {
  const [data, setData] = useState<Awaited<
      ReturnType<typeof getBrandMatrix>
    > | null>(null),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      getBrandMatrix(search)
        .then((d) => {
          if (live) setData(d);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [search, revision]);
  async function act(fn: () => Promise<unknown>, s: string) {
    setBusy(true);
    setError("");
    try {
      await fn();
      setNotice(s);
      setRevision((r) => r + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="supply">
      <nav>
        <Link href="/compras/abastecimento">← Abastecimento</Link>
        <Link href="/compras/prisma/estrategia">Estratégia</Link>
      </nav>
      <header>
        <p className="eyebrow">PILOTO DE CONSOLIDAÇÃO</p>
        <h1>Marcas e distribuidores.</h1>
        <p>
          Compare o custo da quantidade que chega à cozinha, com a condição
          comercial completa.
        </p>
      </header>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <label>
        Buscar produto
        <input value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      {!data ? (
        <p role="status">Lendo matriz…</p>
      ) : (
        <>
          <p>
            {data.total} itens · {data.linked} ligados ao Everest (
            {data.total ? ((data.linked / data.total) * 100).toFixed(1) : "0"}
            %). Ligações automáticas exigem nome e unidade iguais; alternativas
            continuam sujeitas à homologação.
          </p>
          {data.items.map((item) => (
            <details className="panel" key={item.id}>
              <summary>
                <strong>{item.produto}</strong> · {item.categoria} ·{" "}
                {item.item_id ? "Ligado ao Everest" : "Vínculo pendente"}
              </summary>
              <p>
                Unidade: {item.unidade} · atual: {item.marca_atual} ·
                referências: {(item.marcas ?? []).join(" / ")}
              </p>
              <p>{item.observacao}</p>
              <LinkItem id={item.id} busy={busy || !data.canEdit} act={act} />
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Distribuidor</th>
                      <th>Marca / homologação</th>
                      <th>R$ por {item.unidade} utilizável</th>
                      <th>Frete / mínimo</th>
                      <th>Validade / prazo</th>
                      <th>Crédito / entrega</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DISTRIBUIDORES.map((d) => {
                      const q = data.quotes.find(
                        (q) => q.matriz_id === item.id && q.distribuidor === d,
                      );
                      const money = (n: unknown) =>
                        n == null
                          ? "Pendente"
                          : Number(n).toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            });
                      return (
                        <tr key={d}>
                          <th>{d}</th>
                          <td>
                            {q?.marca || "Pendente"} ·{" "}
                            {q?.homologado ? "Homologado" : "A validar"}
                          </td>
                          <td>
                            {q?.preco && q?.quantidade_utilizavel
                              ? money(q.preco / q.quantidade_utilizavel)
                              : "Pendente"}
                          </td>
                          <td>
                            {money(q?.frete)} / {money(q?.pedido_minimo)}
                          </td>
                          <td>
                            {q?.validade ?? "Pendente"} / {q?.prazo_dias ?? "—"}{" "}
                            dias
                          </td>
                          <td>
                            {money(q?.credito_disponivel)} /{" "}
                            {q?.confiabilidade_pct ?? "—"}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p>
                Preço por unidade utilizável = preço da embalagem ÷ quantidade
                aproveitável em {item.unidade}. Frete é por pedido e deve ser
                rateado no lote; não é somado inteiro a cada item.
              </p>
              <QuoteForm
                item={item}
                quotes={data.quotes.filter((q) => q.matriz_id === item.id)}
                disabled={busy || !data.canEdit}
                act={act}
              />
            </details>
          ))}
        </>
      )}
    </main>
  );
}
function LinkItem({
  id,
  busy,
  act,
}: {
  id: string;
  busy: boolean;
  act: (fn: () => Promise<unknown>, s: string) => Promise<void>;
}) {
  const [search, setSearch] = useState(""),
    [items, setItems] = useState<{ id: string; descricao: string }[]>([]),
    [error, setError] = useState("");
  return (
    <details>
      <summary>Conferir vínculo com o Everest</summary>
      <label>
        Nome do insumo
        <input value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      <button
        disabled={busy}
        onClick={() =>
          searchSupplyItems(search)
            .then(setItems)
            .catch((e) => setError(e.message))
        }
      >
        Buscar no Everest
      </button>
      {error && <p role="alert">{error}</p>}
      {items.length > 0 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void act(
              () => linkMatrixItem({ id, item: String(f.get("item")) }),
              "Vínculo confirmado.",
            );
          }}
        >
          <label>
            Item
            <select name="item">
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.descricao}
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy}>Confirmar vínculo</button>
        </form>
      )}
    </details>
  );
}
function QuoteForm({
  item,
  quotes,
  disabled,
  act,
}: {
  item: Awaited<ReturnType<typeof getBrandMatrix>>["items"][number];
  quotes: Awaited<ReturnType<typeof getBrandMatrix>>["quotes"];
  disabled: boolean;
  act: (fn: () => Promise<unknown>, s: string) => Promise<void>;
}) {
  const [distributor, setDistributor] = useState<string>("Bidfood");
  const q = quotes.find((q) => q.distribuidor === distributor);
  return (
    <details>
      <summary>Registrar ou atualizar cotação</summary>
      <label>
        Distribuidor
        <select
          value={distributor}
          onChange={(e) => setDistributor(e.target.value)}
        >
          {DISTRIBUIDORES.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </label>
      <form
        key={`${distributor}|${q?.atualizado_em}`}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const n = (k: string) => (f.get(k) ? Number(f.get(k)) : null);
          void act(
            () =>
              saveQuote({
                matriz_id: item.id,
                distribuidor: distributor,
                marca: String(f.get("marca") ?? ""),
                preco: n("preco"),
                quantidade_utilizavel: n("quantidade_utilizavel"),
                frete: n("frete"),
                pedido_minimo: n("pedido_minimo"),
                validade: f.get("validade") || null,
                prazo_dias: n("prazo_dias"),
                credito_disponivel: n("credito_disponivel"),
                confiabilidade_pct: n("confiabilidade_pct"),
                homologado: f.has("homologado"),
                observacao: String(f.get("observacao") ?? ""),
              }),
            "Cotação salva.",
          );
        }}
      >
        <div className="fields">
          <label>
            Marca cotada
            <input name="marca" defaultValue={q?.marca ?? ""} />
          </label>
          {[
            ["preco", "Preço da embalagem (R$)"],
            [
              "quantidade_utilizavel",
              `Quantidade utilizável (${item.unidade})`,
            ],
            ["frete", "Frete do pedido (R$)"],
            ["pedido_minimo", "Pedido mínimo (R$)"],
            ["prazo_dias", "Prazo de pagamento (dias)"],
            ["credito_disponivel", "Crédito disponível (R$)"],
            ["confiabilidade_pct", "Entregas completas no prazo (%)"],
          ].map(([name, label]) => (
            <label key={name}>
              {label}
              <input
                type="number"
                min="0"
                step={name === "prazo_dias" ? "1" : "0.01"}
                name={name}
                defaultValue={q?.[name!] ?? ""}
              />
            </label>
          ))}
          <label>
            Validade da cotação
            <input
              type="date"
              name="validade"
              defaultValue={q?.validade ?? ""}
            />
          </label>
          <label>
            Embalagem, validade do produto e evidência
            <input name="observacao" defaultValue={q?.observacao ?? ""} />
          </label>
        </div>
        <label className="checks">
          <input
            name="homologado"
            type="checkbox"
            defaultChecked={q?.homologado}
          />
          Marca, rendimento e condição homologados
        </label>
        <button disabled={disabled}>Salvar cotação</button>
      </form>
    </details>
  );
}
