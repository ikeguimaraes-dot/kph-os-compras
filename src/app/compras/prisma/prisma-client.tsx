"use client";
import { useEffect, useRef, useState } from "react";
import {
  getPrisma,
  getPrismaAnchors,
  listPrismaPlan,
  addPrismaPlan,
  updatePrismaPlan,
  type Plan,
  type PrismaFilter,
} from "@/lib/compras/prisma-actions";
import type { PrismaAnalysis, Supplier } from "@/lib/compras/prisma-engine";
import { PRISMA, supplierAction } from "@/lib/compras/prisma-config";
const brl = (n: number) =>
  Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const compact = (n: number) =>
  Number(n).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  });
const pct = (n: number | null) =>
  n === null
    ? "—"
    : `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const inf = (n: number | null) =>
  n === null ? "—" : `${n > 0 ? "+" : ""}${pct(n)}`;
const dateBR = (v: string) => v.split("-").reverse().join("/");
const message = (e: unknown) =>
  e instanceof Error
    ? /server action|failed to find|unexpected response/i.test(e.message)
      ? "A conexão desta tela foi atualizada. Recarregue para buscar os dados."
      : e.message
    : "Não foi possível concluir. Tente novamente.";
type Anchors = Awaited<ReturnType<typeof getPrismaAnchors>>;
type Drawer =
  { kind: "category"; name: string } | { kind: "supplier"; root: string };
const tabs = [
  "Decisões + Categorias",
  "Fornecedores",
  "Âncoras",
  "Plano de ação",
];

export default function PrismaClient({
  units,
  initialStart,
  initialEnd,
}: {
  units: { id: string; name: string }[];
  initialStart: string;
  initialEnd: string;
}) {
  const [filter, setFilter] = useState<PrismaFilter>({
    unitId: null,
    start: initialStart,
    end: initialEnd,
  });
  const [draft, setDraft] = useState(filter),
    [tab, setTab] = useState(0),
    [data, setData] = useState<PrismaAnalysis | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<Plan[]>([]),
    [canGroup, setCanGroup] = useState(false),
    [anchors, setAnchors] = useState<Anchors | null>(null);
  const [anchorLoading, setAnchorLoading] = useState(false),
    [search, setSearch] = useState(""),
    [quadrant, setQuadrant] = useState("Todos");
  const [drawer, setDrawer] = useState<Drawer | null>(null),
    [migration, setMigration] = useState(25),
    [refresh, setRefresh] = useState(0);
  const modal = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    setAnchors(null);
    setDrawer(null);
    setPlan([]);
    Promise.all([getPrisma(filter), listPrismaPlan(filter.unitId)])
      .then(([d, p]) => {
        if (active) {
          setData(d);
          setPlan(p.rows);
          setCanGroup(p.canGroup);
        }
      })
      .catch((e) => {
        if (active) setError(message(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filter, refresh]);
  useEffect(() => {
    if (tab !== 2) return;
    let active = true;
    setAnchorLoading(true);
    getPrismaAnchors(filter.unitId)
      .then((a) => {
        if (active) setAnchors(a);
      })
      .catch((e) => {
        if (active) setError(message(e));
      })
      .finally(() => {
        if (active) setAnchorLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tab, filter.unitId, refresh]);
  useEffect(() => {
    if (drawer) {
      setMigration(25);
      modal.current?.showModal();
    } else modal.current?.close();
  }, [drawer]);
  async function add(root?: string, process = false) {
    setBusy(true);
    setError("");
    try {
      const result = await addPrismaPlan({ filter, root, process });
      const p = await listPrismaPlan(filter.unitId);
      setPlan(p.rows);
      setNotice(`No plano: ${result.titulo}`);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(p: Plan) {
    setBusy(true);
    setError("");
    try {
      await updatePrismaPlan({
        id: p.id,
        version: p.atualizado_em,
        dono: p.dono,
        prazo: p.prazo,
        status: p.status,
        capturado_rs: Number(p.capturado_rs),
      });
      setPlan((await listPrismaPlan(filter.unitId)).rows);
      setNotice("Ação atualizada no banco.");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const inPlan = (root: string) =>
    plan.some((p) => p.alvo === root && p.unit_id === filter.unitId);
  const canAdd = !!filter.unitId || canGroup;
  const decisions = data
    ? [...data.suppliers]
        .filter((s) => s.overpaid > 0)
        .sort((a, b) => b.overpaid - a.overpaid)
        .slice(0, 6)
    : [];
  const visible =
    data?.suppliers.filter(
      (s) =>
        (quadrant === "Todos" || s.quadrant === quadrant) &&
        `${s.name} ${s.root}`.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  const selectedSupplier =
    drawer?.kind === "supplier"
      ? data?.suppliers.find((s) => s.root === drawer.root)
      : undefined;
  const selectedPairs =
    data?.pairs
      .filter((p) =>
        drawer?.kind === "category"
          ? p.category === drawer.name
          : p.root === selectedSupplier?.root,
      )
      .sort((a, b) => b.overpaid - a.overpaid) ?? [];
  const drawerCeiling = selectedPairs.reduce((s, p) => s + p.overpaid, 0);
  const scope = filter.unitId
    ? units.find((u) => u.id === filter.unitId)?.name
    : units.map((u) => u.name).join(", ");
  const captured = plan
    .filter((p) => p.status === "capturada")
    .reduce((s, p) => s + Number(p.capturado_rs), 0);
  return (
    <article className="prisma">
      <nav className="prisma-breadcrumb" aria-label="Navegação de compras">
        <a href="/compras">Compras</a>
        <span>/</span>
        <span>Prisma</span>
        <a href="/compras/recebimento">Conferir notas ↗</a>
      </nav>
      <header className="prisma-hero">
        <p className="prisma-eyebrow">GRUPO KPH · INTELIGÊNCIA DE COMPRAS</p>
        <h1>
          Prisma de Compras<span>.</span>
        </h1>
        <p className="prisma-intro">
          Cada compra deixa uma pista.
          <br />
          Aqui, ela vira uma decisão.
        </p>
        <form
          className="prisma-filters"
          onSubmit={(e) => {
            e.preventDefault();
            setFilter({ ...draft });
            setNotice("");
          }}
        >
          <label>
            Casa
            <select
              value={draft.unitId ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, unitId: e.target.value || null })
              }
            >
              <option value="">Todas as casas autorizadas</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            De
            <input
              type="date"
              required
              value={draft.start}
              onChange={(e) => setDraft({ ...draft, start: e.target.value })}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              required
              value={draft.end}
              min={draft.start}
              onChange={(e) => setDraft({ ...draft, end: e.target.value })}
            />
          </label>
          <button disabled={loading} className="prisma-primary">
            Aplicar período
          </button>
        </form>
        <p className="prisma-source">
          Everest · notas com CFOP de CMV · {dateBR(filter.start)} a{" "}
          {dateBR(filter.end)} · {scope}
        </p>
      </header>
      {error && (
        <div className="prisma-alert" role="alert">
          {error}{" "}
          <button onClick={() => window.location.reload()}>Recarregar</button>
        </div>
      )}
      {notice && (
        <div className="prisma-notice" role="status">
          {notice} <button onClick={() => setTab(3)}>Ver plano →</button>
        </div>
      )}
      {loading ? (
        <div className="prisma-loading" role="status">
          <span />
          Calculando preços, concentração e oportunidades nas notas do período…
        </div>
      ) : (
        data && (
          <>
            <section className="prisma-metrics" aria-label="Resumo do período">
              <div>
                <span>Comprado para CMV</span>
                <strong title={brl(data.total)}>{compact(data.total)}</strong>
                <small>
                  {brl(data.total)} · {data.lines.toLocaleString("pt-BR")} itens
                  de nota
                </small>
              </div>
              <div>
                <span>Fornecedores</span>
                <strong>{data.suppliers.length}</strong>
                <small>{data.pareto} fazem 80% do gasto</small>
              </div>
              <div className="prisma-emphasis">
                <span>Acima do melhor preço</span>
                <strong title={brl(data.overpaid)}>
                  {compact(data.overpaid)}
                </strong>
                <small>Teto no período · validar equivalência</small>
              </div>
              <div>
                <span>Gasto com pedido</span>
                <strong>{pct(data.orderShare)}</strong>
                <small>Número de pedido informado na nota</small>
              </div>
            </section>
            <div
              className="prisma-tabs"
              role="tablist"
              aria-label="Visões do Prisma"
            >
              {tabs.map((t, i) => (
                <button
                  id={`prisma-tab-${i}`}
                  role="tab"
                  aria-controls="prisma-panel"
                  aria-selected={tab === i}
                  key={t}
                  onClick={() => setTab(i)}
                >
                  {t}
                  {i === 2 && <small> prévia</small>}
                  {i === 3 && (
                    <span className="prisma-count">{plan.length}</span>
                  )}
                </button>
              ))}
            </div>
            <section
              id="prisma-panel"
              role="tabpanel"
              aria-labelledby={`prisma-tab-${tab}`}
            >
              {tab === 0 && (
                <>
                  <div className="prisma-section-head">
                    <div>
                      <p className="prisma-eyebrow">01 / PRIORIDADES</p>
                      <h2>O que decidir agora</h2>
                      <p>
                        Ordenado pelo teto de diferença de preço. Leve ao plano
                        o que você vai atacar.
                      </p>
                    </div>
                    <span className="prisma-tag">
                      {dateBR(filter.start)} — {dateBR(filter.end)}
                    </span>
                  </div>
                  <ol className="prisma-decisions">
                    {decisions.map((s, i) => (
                      <li key={s.root}>
                        <span className="prisma-rank">{i + 1}</span>
                        <div>
                          <button
                            className="prisma-text-button"
                            onClick={() =>
                              setDrawer({ kind: "supplier", root: s.root })
                            }
                          >
                            {supplierAction(s)}: {s.name}
                          </button>
                          <p>
                            {s.quadrant} em {s.category.toLowerCase()} · nota{" "}
                            {s.score ?? "—"}. {pct(s.categoryShare)} da
                            categoria.{" "}
                            {s.inflation !== null &&
                              `Inflação de ${inf(s.inflation)} no mesmo item e fornecedor.`}
                          </p>
                        </div>
                        <div className="prisma-decision-value">
                          <strong>{compact(s.overpaid)}</strong>
                          <small>teto no período</small>
                        </div>
                        <button
                          disabled={busy || !canAdd || inPlan(s.root)}
                          onClick={() => add(s.root)}
                        >
                          {inPlan(s.root) ? "No plano ✓" : "Levar ao plano →"}
                        </button>
                      </li>
                    ))}
                    {data.orderShare < 0.95 && (
                      <li>
                        <span className="prisma-rank">↳</span>
                        <div>
                          <strong>Exigir pedido de compra antes da nota</strong>
                          <p>
                            {pct(data.orderShare)} do gasto tem pedido
                            informado. Combine preço antes de receber e registre
                            as exceções.
                          </p>
                        </div>
                        <span className="prisma-tag">Processo</span>
                        <button
                          disabled={
                            busy || !canAdd || inPlan("pedido-antes-nota")
                          }
                          onClick={() => add(undefined, true)}
                        >
                          {inPlan("pedido-antes-nota")
                            ? "No plano ✓"
                            : "Levar ao plano →"}
                        </button>
                      </li>
                    )}
                  </ol>
                  {!canAdd && (
                    <p>
                      Selecione uma casa para registrar ações no seu escopo.
                    </p>
                  )}
                  <div className="prisma-section-head">
                    <div>
                      <p className="prisma-eyebrow">02 / CATEGORIAS</p>
                      <h2>Onde concentrar a negociação</h2>
                      <p>
                        Abra uma categoria para comparar fornecedores e simular
                        a migração de compras.
                      </p>
                    </div>
                  </div>
                  <div className="prisma-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Categoria</th>
                          <th>Gasto</th>
                          <th>Fornecedores</th>
                          <th>Fazem 80%</th>
                          <th>Maior fatia</th>
                          <th>Inflação</th>
                          <th>Com pedido</th>
                          <th>Acima do melhor preço</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.categories.map((c) => (
                          <tr key={c.name}>
                            <th>
                              <button
                                className="prisma-text-button"
                                onClick={() =>
                                  setDrawer({ kind: "category", name: c.name })
                                }
                              >
                                {c.name} ↗
                              </button>
                            </th>
                            <td title={brl(c.spend)}>{compact(c.spend)}</td>
                            <td>{c.suppliers}</td>
                            <td>{c.pareto}</td>
                            <td>{pct(c.largest)}</td>
                            <td>{inf(c.inflation)}</td>
                            <td>{pct(c.orderShare)}</td>
                            <td className="prisma-money">
                              {compact(c.overpaid)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {tab === 1 && (
                <>
                  <div className="prisma-section-head">
                    <div>
                      <p className="prisma-eyebrow">RELAÇÃO × NEGOCIAÇÃO</p>
                      <h2>Cada fornecedor pede uma estratégia</h2>
                      <p>
                        Impacto alto: os fornecedores que completam 80% do
                        gasto. Risco alto a partir de {pct(PRISMA.highRisk)}.
                      </p>
                    </div>
                  </div>
                  <Matrix
                    suppliers={data.suppliers}
                    onSelect={(root) => setDrawer({ kind: "supplier", root })}
                  />
                  <div className="prisma-filters">
                    <label>
                      Buscar fornecedor
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Nome ou raiz do CNPJ"
                      />
                    </label>
                    <label>
                      Perfil
                      <select
                        value={quadrant}
                        onChange={(e) => setQuadrant(e.target.value)}
                      >
                        {[
                          "Todos",
                          "Estratégico",
                          "Alavancável",
                          "Gargalo",
                          "Não crítico",
                        ].map((q) => (
                          <option key={q}>{q}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="prisma-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Fornecedor</th>
                          <th>Perfil</th>
                          <th>Gasto</th>
                          <th>Nota</th>
                          <th>Risco</th>
                          <th>Inflação</th>
                          <th>Prazo</th>
                          <th>Acima do melhor preço</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((s) => (
                          <tr key={s.root}>
                            <th>
                              <button
                                className="prisma-text-button"
                                onClick={() =>
                                  setDrawer({ kind: "supplier", root: s.root })
                                }
                              >
                                {s.name}
                              </button>
                              <small>{s.category}</small>
                            </th>
                            <td>
                              <span className="prisma-tag">{s.quadrant}</span>
                            </td>
                            <td>{compact(s.spend)}</td>
                            <td>
                              {s.score ?? "—"}
                              <small>
                                {pct(s.scoreCoverage)} dos critérios
                              </small>
                            </td>
                            <td>{pct(s.risk)}</td>
                            <td>{inf(s.inflation)}</td>
                            <td>
                              {s.payment === null
                                ? "—"
                                : `${s.payment.toFixed(0)} dias`}
                            </td>
                            <td className="prisma-money">
                              {compact(s.overpaid)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {tab === 2 && (
                <>
                  <div className="prisma-section-head">
                    <div>
                      <p className="prisma-eyebrow">
                        VENDAS → FICHAS → INSUMOS
                      </p>
                      <h2>Quem sustenta a receita</h2>
                      <p>
                        Prévia dos últimos 12 meses até {dateBR(initialEnd)}.
                        Esta visão usa a janela fixa do Financeiro; o período
                        personalizado se aplica às outras análises.
                      </p>
                    </div>
                    <a
                      className="prisma-link"
                      href="https://kph-os-financeiro.vercel.app/financeiro/dre/cmv/ponte"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Revisar ponte de fichas ↗
                    </a>
                  </div>
                  {anchorLoading ? (
                    <p role="status">Carregando consumo teórico…</p>
                  ) : (
                    anchors && (
                      <AnchorPanel
                        anchors={anchors}
                        suppliers={data.suppliers}
                        defaultWindow={
                          filter.start === initialStart &&
                          filter.end === initialEnd
                        }
                      />
                    )
                  )}
                </>
              )}
              {tab === 3 && (
                <>
                  <div className="prisma-section-head">
                    <div>
                      <p className="prisma-eyebrow">DA DECISÃO À EXECUÇÃO</p>
                      <h2>Plano de ação</h2>
                      <p>
                        Salvo no banco e compartilhado com quem tem acesso à
                        casa. O plano permanece quando o período muda.
                      </p>
                    </div>
                    <div>
                      <small>Economia registrada como capturada</small>
                      <strong className="prisma-captured">
                        {brl(captured)}
                      </strong>
                    </div>
                  </div>
                  {!plan.length ? (
                    <div className="prisma-empty">
                      <h3>Escolha a primeira negociação.</h3>
                      <p>
                        Use “Levar ao plano” nas decisões ou no detalhe de um
                        fornecedor.
                      </p>
                      <button onClick={() => setTab(0)}>
                        Ver prioridades →
                      </button>
                    </div>
                  ) : (
                    <div className="prisma-plan">
                      {plan.map((p) => (
                        <PlanCard
                          key={`${p.id}-${p.atualizado_em}`}
                          plan={p}
                          busy={busy}
                          scope={
                            p.unit_id
                              ? (units.find((u) => u.id === p.unit_id)?.name ??
                                "Casa")
                              : "Grupo KPH"
                          }
                          onSave={save}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
            <footer className="prisma-method">
              <details>
                <summary>Como ler os números e as ressalvas</summary>
                <p>
                  Gasto inclui todos os itens com CFOP de CMV, inclusive
                  classificações incompletas. Preço médio = valor total ÷
                  quantidade derivada de valor/preço unitário. A comparação
                  reúne o mesmo código de item entre fornecedores por raiz de
                  CNPJ, dentro das casas e datas selecionadas.
                </p>
                <p>
                  “Acima do melhor preço” é um teto no período, sem validar
                  qualidade, época, frete ou embalagem. Só compara itens com
                  mais de um fornecedor e razão de preço máximo/mínimo até{" "}
                  {PRISMA.priceRatioLimit}. Cobertura de gasto comparável:{" "}
                  {pct(data.priceCoverage)}. Não é economia garantida nem
                  projeção anual. A inflação não é somada a esse teto.
                </p>
                <p>
                  Inflação compara as médias ponderadas dos 90 dias finais com
                  os 90 iniciais, no mesmo item e fornecedor. Períodos menores
                  que 180 dias não exibem inflação. “Com pedido” exige número
                  não vazio e diferente de zero; não comprova que o pedido
                  precedeu a nota.
                </p>
                <p>
                  Risco: exclusividade 45%; peso na categoria 25%, normalizado
                  pelo limite de 50%; inflação 15%, limite de 20%; oscilação
                  15%, limite de 30%. Exclusividade é medida dentro do recorte
                  selecionado.
                </p>
                <p>
                  Nota: preço 35%, inflação contra categoria 25%, prazo 25%,
                  estabilidade 15%. Preço recebe 100 sem diferença e zero quando
                  a diferença chega a 25% do gasto comparável; inflação recebe
                  50 na média da categoria, 100 a 20 pontos abaixo e zero a 20
                  pontos percentuais acima; prazo atinge 100 em 45 dias;
                  estabilidade chega a zero com coeficiente de variação de 30%.
                  Critérios sem dados são excluídos e os pesos restantes
                  redistribuídos. Sem preço comparável nem inflação, a nota não
                  é calculada. As escalas seguem o HTML original e estão
                  documentadas na configuração. Divergência de pedido não entra
                  na nota.
                </p>
                <p>
                  Âncoras só recebem classificação com cobertura suficiente da
                  ponte e de custos. Receita é rateada pelo custo dos insumos;
                  consumo teórico não mede perda real nem substitui estoque.
                  Cadastros e custos são mantidos no Everest.
                </p>
              </details>
            </footer>
            <dialog
              className="prisma-drawer"
              ref={modal}
              onClose={() => setDrawer(null)}
              aria-labelledby="prisma-drawer-title"
            >
              <div className="prisma-drawer-head">
                <span className="prisma-eyebrow">DETALHE DA DECISÃO</span>
                <button
                  aria-label="Fechar detalhe"
                  onClick={() => setDrawer(null)}
                >
                  ×
                </button>
              </div>
              <h2 id="prisma-drawer-title">
                {drawer?.kind === "category"
                  ? drawer.name
                  : selectedSupplier?.name}
              </h2>
              {selectedSupplier && (
                <>
                  <p>
                    {selectedSupplier.quadrant} · nota{" "}
                    {selectedSupplier.score ?? "—"} ·{" "}
                    {pct(selectedSupplier.scoreCoverage)} dos critérios
                    disponíveis.
                  </p>
                  <dl className="prisma-detail-metrics">
                    <div>
                      <dt>Comprado</dt>
                      <dd>{brl(selectedSupplier.spend)}</dd>
                    </div>
                    <div>
                      <dt>Itens exclusivos</dt>
                      <dd>{pct(selectedSupplier.exclusive)}</dd>
                    </div>
                    <div>
                      <dt>Peso na categoria</dt>
                      <dd>{pct(selectedSupplier.categoryShare)}</dd>
                    </div>
                    <div>
                      <dt>Prazo ponderado</dt>
                      <dd>
                        {selectedSupplier.payment === null
                          ? "Sem dados"
                          : `${selectedSupplier.payment.toFixed(1)} dias`}
                      </dd>
                    </div>
                  </dl>
                  <button
                    className="prisma-primary"
                    disabled={busy || !canAdd || inPlan(selectedSupplier.root)}
                    onClick={() => add(selectedSupplier.root)}
                  >
                    {inPlan(selectedSupplier.root)
                      ? "No plano ✓"
                      : "Levar ao plano"}
                  </button>
                </>
              )}
              <section className="prisma-simulation">
                <h3>Simular migração para o melhor preço</h3>
                <p>
                  Aplicar o preço de referência a {migration}% do volume
                  comparável.
                </p>
                <label>
                  Volume a migrar
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={migration}
                    onChange={(e) => setMigration(Number(e.target.value))}
                  />
                </label>
                <strong>{brl((drawerCeiling * migration) / 100)}</strong>
                <small>
                  Teto simulado no período. Validar embalagem, qualidade e
                  capacidade de entrega.
                </small>
              </section>
              <h3>Comparação por item</h3>
              <p>
                Unidade conforme cadastro Everest. “Verificar” sinaliza possível
                diferença de embalagem.
              </p>
              <div className="prisma-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Item / fornecedor</th>
                      <th>Preço médio</th>
                      <th>Melhor</th>
                      <th>Teto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPairs.map((p) => (
                      <tr key={`${p.item}-${p.root}`}>
                        <th>
                          {p.itemName}
                          <small>
                            {p.name} · {p.unit}
                          </small>
                          {p.warning && (
                            <span className="prisma-tag">
                              Verificar embalagem
                            </span>
                          )}
                        </th>
                        <td>{brl(p.price)}</td>
                        <td>{brl(p.best)}</td>
                        <td>
                          {p.comparable
                            ? brl(p.overpaid)
                            : p.exclusive
                              ? "Exclusivo"
                              : "Fora do limite 2,5×"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </dialog>
          </>
        )
      )}
    </article>
  );
}

function Matrix({
  suppliers,
  onSelect,
}: {
  suppliers: Supplier[];
  onSelect: (root: string) => void;
}) {
  const max = Math.max(1, ...suppliers.map((s) => s.spend));
  return (
    <div className="prisma-matrix">
      <svg
        viewBox="0 0 900 360"
        role="img"
        aria-labelledby="matrix-title matrix-desc"
      >
        <title id="matrix-title">Matriz de fornecedores</title>
        <desc id="matrix-desc">
          Risco no eixo horizontal. Impacto alto na metade superior; impacto
          baixo na inferior. A tabela abaixo contém todos os fornecedores e
          perfis.
        </desc>
        <rect x="45" y="20" width="297.5" height="150" className="matrix-low" />
        <rect
          x="342.5"
          y="20"
          width="552.5"
          height="150"
          className="matrix-high"
        />
        <rect
          x="45"
          y="170"
          width="297.5"
          height="150"
          className="matrix-neutral"
        />
        <rect
          x="342.5"
          y="170"
          width="552.5"
          height="150"
          className="matrix-warn"
        />
        <text x="60" y="43">
          ALAVANCÁVEL
        </text>
        <text x="860" y="43" textAnchor="end">
          ESTRATÉGICO
        </text>
        <text x="60" y="306">
          NÃO CRÍTICO
        </text>
        <text x="860" y="306" textAnchor="end">
          GARGALO
        </text>
        <path d="M342.5 20V320 M45 170H895" className="matrix-axis" />
        <text x="45" y="347">
          Menor risco
        </text>
        <text x="895" y="347" textAnchor="end">
          Maior risco →
        </text>
        <text transform="translate(18,170) rotate(-90)" textAnchor="middle">
          IMPACTO NO GASTO
        </text>
        {suppliers.map((s, i) => {
          const y = s.highImpact ? 70 + ((i * 29) % 75) : 206 + ((i * 23) % 65);
          return (
            <circle
              key={s.root}
              cx={45 + Math.min(1, s.risk) * 850}
              cy={y}
              r={4 + Math.sqrt(Math.max(0, s.spend) / max) * 15}
              className={s.highImpact ? "matrix-dot-high" : "matrix-dot"}
              role="button"
              tabIndex={0}
              aria-label={`${s.name}, ${s.quadrant}, risco ${pct(s.risk)}`}
              onClick={() => onSelect(s.root)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(s.root);
                }
              }}
            >
              <title>
                {s.name} · {compact(s.spend)} · {s.quadrant}
              </title>
            </circle>
          );
        })}
      </svg>
      <p>
        Tamanho do círculo = gasto. Posição vertical separa os grupos de
        impacto; não é escala de valor.
      </p>
    </div>
  );
}
function PlanCard({
  plan,
  busy,
  scope,
  onSave,
}: {
  plan: Plan;
  busy: boolean;
  scope: string;
  onSave: (p: Plan) => void;
}) {
  const [p, setP] = useState(plan);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(p);
      }}
      className="prisma-plan-card"
    >
      <div className="prisma-plan-top">
        <span className="prisma-tag">{scope}</span>
        <small>
          Criada em {new Date(p.criado_em).toLocaleDateString("pt-BR")}
        </small>
      </div>
      <h3>{p.titulo}</h3>
      <p>
        Teto de referência ao criar: <strong>{brl(p.rs_em_jogo)}</strong>.
        Validar antes de negociar.
      </p>
      <div className="prisma-filters">
        <label>
          Responsável
          <input
            value={p.dono}
            maxLength={120}
            onChange={(e) => setP({ ...p, dono: e.target.value })}
            placeholder="Definir responsável"
          />
        </label>
        <label>
          Prazo
          <input
            type="date"
            value={p.prazo ?? ""}
            onChange={(e) => setP({ ...p, prazo: e.target.value || null })}
          />
        </label>
        <label>
          Status
          <select
            value={p.status}
            onChange={(e) =>
              setP({ ...p, status: e.target.value as Plan["status"] })
            }
          >
            {["aberta", "em negociação", "capturada", "descartada"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Economia capturada (R$)
          <input
            type="number"
            min="0"
            step="0.01"
            value={p.capturado_rs}
            onChange={(e) =>
              setP({ ...p, capturado_rs: Number(e.target.value) })
            }
          />
        </label>
        <button disabled={busy} className="prisma-primary">
          Salvar ação
        </button>
      </div>
    </form>
  );
}
function AnchorPanel({
  anchors,
  suppliers,
  defaultWindow,
}: {
  anchors: Anchors;
  suppliers: Supplier[];
  defaultWindow: boolean;
}) {
  const sums = new Map<
    string,
    {
      root: string;
      name: string;
      bought: number;
      consumed: number;
      revenue: number;
    }
  >();
  for (const r of anchors.rows) {
    const s = sums.get(r.raiz_cnpj) ?? {
      root: r.raiz_cnpj,
      name: r.fornecedor_nome,
      bought: 0,
      consumed: 0,
      revenue: 0,
    };
    s.bought += Number(r.comprado_rs);
    s.consumed += Number(r.consumo_teorico_rs);
    s.revenue += Number(r.receita_dependente_rs);
    sums.set(s.root, s);
  }
  const coverages = anchors.units.map((u) => {
    const c = anchors.coverage.find((c) => c.unit_id === u.id);
    const revenue = Number(c?.receita_total ?? 0);
    const allocated = anchors.rows
      .filter((r) => r.unit_id === u.id)
      .reduce((s, r) => s + Number(r.receita_dependente_rs), 0);
    return {
      ...u,
      confirmed: revenue ? Number(c?.receita_confirmada ?? 0) / revenue : 0,
      resolved: revenue ? Number(c?.receita_resolvida ?? 0) / revenue : 0,
      effective: revenue ? allocated / revenue : 0,
    };
  });
  const ready =
    coverages.length > 0 &&
    coverages.every(
      (c) =>
        c.confirmed >= PRISMA.minimumCoverage &&
        c.effective >= PRISMA.minimumCoverage,
    );
  const updated = anchors.rows[0]?.atualizado_em;
  return (
    <>
      <div className="prisma-coverage">
        {coverages.map((c) => (
          <div key={c.id}>
            <strong>{c.name}</strong>
            <p>{pct(c.confirmed)} com ficha confirmada</p>
            <progress
              max="1"
              value={c.confirmed}
              aria-label={`Receita com ficha confirmada de ${c.name}`}
            />
            <small>
              {pct(c.resolved)} da fila resolvida · {pct(c.effective)} da
              receita atribuída com custos completos · meta 90%
            </small>
          </div>
        ))}
      </div>
      {!ready && (
        <div className="prisma-alert">
          Sem ficha suficiente para classificar âncoras com segurança. Os
          valores abaixo são parciais. A diferença entre comprado e consumo pode
          vir de fichas pendentes, preço ausente ou unidade de medida; não é
          prova de desperdício.
        </div>
      )}
      <div className="prisma-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fornecedor</th>
              <th>Comprado</th>
              <th>Consumo teórico</th>
              <th>Consumo / compra</th>
              <th>Receita dependente</th>
              <th>Leitura</th>
            </tr>
          </thead>
          <tbody>
            {[...sums.values()]
              .sort((a, b) => b.revenue - a.revenue)
              .map((s) => {
                const score = defaultWindow
                  ? suppliers.find((p) => p.root === s.root)?.score
                  : null;
                const label = !ready
                  ? "Sem ficha suficiente"
                  : s.revenue >= PRISMA.anchorRevenue
                    ? score !== null &&
                      score !== undefined &&
                      score < PRISMA.fragileScore
                      ? "Âncora frágil"
                      : "Âncora"
                    : s.bought >= PRISMA.falseAnchorSpend &&
                        s.revenue < s.bought
                      ? "Falso âncora"
                      : "Complementar";
                return (
                  <tr key={s.root}>
                    <th>{s.name}</th>
                    <td>{compact(s.bought)}</td>
                    <td>{compact(s.consumed)}</td>
                    <td>{s.bought ? pct(s.consumed / s.bought) : "—"}</td>
                    <td className="prisma-money">{compact(s.revenue)}</td>
                    <td>{label}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <h3>Dez maiores diferenças para investigar</h3>
      <p>
        Comprado menos consumo dos insumos nas fichas confirmadas. Diagnóstico
        parcial da janela de 12 meses; a cobertura ainda limita a interpretação.
      </p>
      <div className="prisma-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Casa / insumo</th>
              <th>Comprado</th>
              <th>Consumo parcial</th>
              <th>Diferença</th>
            </tr>
          </thead>
          <tbody>
            {anchors.diagnostics.map((d) => (
              <tr key={`${d.unit_id}-${d.item_id}`}>
                <th>
                  {d.item_nome}
                  <small>
                    {anchors.units.find((u) => u.id === d.unit_id)?.name} ·{" "}
                    {d.unidade_medida}
                  </small>
                </th>
                <td>{compact(d.comprado_rs)}</td>
                <td>
                  {d.sem_preco
                    ? "Sem preço de compra"
                    : compact(d.consumo_parcial_rs ?? 0)}
                </td>
                <td>{compact(d.diferenca_rs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="prisma-source">
        Atualização do cálculo:{" "}
        {updated ? new Date(updated).toLocaleString("pt-BR") : "aguardando"} ·
        atualização diária após a ingestão.
      </p>
    </>
  );
}
