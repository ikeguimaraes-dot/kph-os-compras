"use client";
import Link from "next/link";
import { supplierMetrics } from "@/lib/compras/supplier-metrics";
import Mindmap from "./mindmap";
import ParetoClient from "./pareto-client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  getMapSupplierDetail,
  saveMapCredit,
  createMapAgreement,
  type getMap,
} from "@/lib/compras/prisma-mapa-actions";
import { addPrismaPlan } from "@/lib/compras/prisma-actions";
import {
  aggregateSuppliers,
  blockKey,
  buildCategoryFlow,
  buildFlow,
  creditColor,
  dishKey,
  filterMap,
  isCritical,
  costLabel,
  unpricedDishes,
  mapView,
  titleTimeline,
  type CategoryFlow,
  type MapBlock,
  type MapCatPurchase,
  type MapEdge,
  type MapFilters,
  type MapPeriod,
  type MapSupplier,
  type MapView,
} from "@/lib/compras/prisma-mapa";
import { PRISMA, categoryName } from "@/lib/compras/prisma-config";
type Data = Awaited<ReturnType<typeof getMap>>;
const brl = (n: number) =>
  Number(n).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
const compact = (n: number) =>
  Number(n).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  });
const pct = (n: number) =>
  `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const date = (s: string | null) =>
  s ? s.slice(0, 10).split("-").reverse().join("/") : "Sem registro";
const age = (s: string, today: string) =>
  Math.max(
    0,
    Math.floor((Date.parse(today) - Date.parse(s.slice(0, 10))) / 86400000),
  );
const amountSource =
  "Receita da ponte confirmada × custo do insumo / custo completo da ficha Everest × share de quantidade comprada do fornecedor em 12 meses. Fonte: v_mapa_aresta. Prévia da receita coberta.";
function Metric({ children, source }: { children: ReactNode; source: string }) {
  return (
    <span
      tabIndex={0}
      className="map-metric"
      title={source}
      aria-label={`${typeof children === "string" ? children : ""}. ${source}`}
    >
      {children}
    </span>
  );
}
function SupplierMetrics({ supplier }: { supplier: MapSupplier | undefined }) {
  return (
    <div
      className="map-supplier-metrics"
      aria-label="Compra, venda sustentada e alavanca anual"
    >
      {supplierMetrics(supplier).map((metric) => (
        <span
          key={metric.label}
          className="map-supplier-metric"
          title={metric.source}
          tabIndex={0}
          aria-label={`${metric.label}. ${metric.source}`}
        >
          {metric.label}
        </span>
      ))}
    </div>
  );
}
function readFilters(p: Record<string, string>): MapFilters {
  return {
    unit: p.unit ?? "",
    period: p.period === "semana" ? "semana" : "12m",
    category: p.category ?? "",
    only86: p.only86 === "1",
    noReserve: p.noReserve === "1",
  };
}

export default function MapClient({
  data,
  initial,
}: {
  data: Data;
  initial: Record<string, string>;
}) {
  const [view, setView] = useState<MapView>(mapView(initial.view)),
    [filters, setFilters] = useState(() => readFilters(initial));
  const [selected, setSelected] = useState(initial.f ?? ""),
    [drawer, setDrawer] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const blocks = data.blocks.filter(
    (b) => !filters.unit || b.unit_id === filters.unit,
  );
  const edges = useMemo(
    () => filterMap(data.edges, data.blocks, filters),
    [data, filters],
  );
  const suppliers = aggregateSuppliers(
    data.suppliers.filter((s) => !filters.unit || s.unit_id === filters.unit),
  );
  const names = new Map(
    aggregateSuppliers(data.suppliers).map((s) => [s.raiz_cnpj, s.nome]),
  );
  const flow = useMemo(
    () => buildFlow(edges, blocks, filters.period),
    [edges, blocks, filters.period],
  );
  const catPurchases = useMemo(
    () =>
      (data.catPurchases as MapCatPurchase[] ?? []).filter(
        (c) => !filters.unit || c.unit_id === filters.unit,
      ),
    [data.catPurchases, filters.unit],
  );
  const categoryFlow = useMemo(
    () => buildCategoryFlow(catPurchases),
    [catPurchases],
  );
  const focus =
    selected || flow.sources[0]?.id || suppliers[0]?.raiz_cnpj || "";
  const chosen = suppliers.find((s) => s.raiz_cnpj === focus);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries({
      view,
      f: selected,
      unit: filters.unit,
      period: filters.period,
      category: filters.category,
      only86: filters.only86 ? "1" : "",
      noReserve: filters.noReserve ? "1" : "",
    })) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params}`,
    );
  }, [view, selected, filters]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (drawer || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (
        e.target instanceof HTMLElement &&
        (e.target.matches("input,select,textarea") ||
          e.target.isContentEditable)
      )
        return;
      const v: Record<string, MapView> = {
        "1": "dinheiro",
        "2": "dependencia",
        "3": "travados",
        "4": "pareto",
      };
      if (v[e.key]) {
        e.preventDefault();
        setView(v[e.key]!);
      }
    };
    const pop = () => {
      const p = Object.fromEntries(new URLSearchParams(window.location.search));
      setView(mapView(p.view));
      setSelected(p.f ?? "");
      setFilters(readFilters(p));
    };
    window.addEventListener("keydown", key);
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("popstate", pop);
    };
  }, [drawer]);
  const openFocus = (root: string) => {
    setSelected(root);
    setView("dependencia");
  };
  const openCard = (root: string) => {
    setSelected(root);
    setDrawer(root);
  };
  const patch = (p: Partial<MapFilters>) => setFilters((f) => ({ ...f, ...p }));
  const blockedIds = new Set(blocks.map(blockKey));
  const shownDishes = new Map<string, MapEdge>();
  for (const e of edges)
    if (blockedIds.has(dishKey(e))) shownDishes.set(dishKey(e), e);
  const blockedDishes = [...shownDishes.values()].sort(
    (a, b) => Number(b.receita_semana) - Number(a.receita_semana),
  );
  const pendingPrices = unpricedDishes(edges);
  const coveredIds = new Set(data.edges.map(dishKey));
  const uncovered = blocks.filter((b) => !coveredIds.has(blockKey(b)));
  return (
    <main className="mapa">
      <nav className="map-nav" aria-label="Prisma">
        <Link href="/compras/prisma">← Cockpit</Link>
        <Link href="/compras/abastecimento">Rotina de abastecimento ↗</Link>
      </nav>
      <header className="map-heading">
        <div>
          <p className="map-eyebrow">PRISMA DE COMPRAS · DEPENDÊNCIAS</p>
          <h1>
            De quem depende
            <br />o seu caixa<span>?</span>
          </h1>
          <p>Fornecedor, insumo e prato. O caminho do dinheiro.</p>
        </div>
        <div className="map-total">
          <small>RECEITA ATRIBUÍDA · PRÉVIA</small>
          <strong>
            <Metric source={amountSource}>{compact(flow.total)}</Metric>
          </strong>
          <span>
            {filters.period === "12m"
              ? "Janela de 12 meses"
              : "Média semanal dos 12 meses"}
          </span>
        </div>
      </header>
      <div className="map-switch" role="group" aria-label="Visão do mapa">
        {(["dinheiro", "dependencia", "travados", "pareto"] as const).map((v, i) => (
          <button
            key={v}
            aria-pressed={view === v}
            aria-keyshortcuts={String(i + 1)}
            onClick={() => setView(v)}
          >
            <span aria-hidden="true">{["↝", "⌘", "⊘", "▥"][i]}</span>
            {["Dinheiro", "Dependência", "Travados", "Pareto"][i]}
            <kbd>{i + 1}</kbd>
          </button>
        ))}
      </div>
      <div className="map-filters">
        <label>
          Casa
          <select
            value={filters.unit}
            onChange={(e) => patch({ unit: e.target.value })}
          >
            <option value="">Todas as casas autorizadas</option>
            {data.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Período
          <select
            value={filters.period}
            onChange={(e) => patch({ period: e.target.value as MapPeriod })}
          >
            <option value="12m">Últimos 12 meses</option>
            <option value="semana">Média semanal · 12 meses</option>
          </select>
        </label>
        <label>
          Categoria
          <select
            value={filters.category}
            onChange={(e) => patch({ category: e.target.value })}
          >
            <option value="">Todos os insumos</option>
            {[
              ...new Set(
                data.edges
                  .map((e) => e.categoria)
                  .filter((c): c is string => !!c),
              ),
            ]
              .sort()
              .map((c) => (
                <option key={c} value={c}>
                  {categoryName(c)}
                </option>
              ))}
          </select>
        </label>
        <label className="map-check">
          <input
            type="checkbox"
            checked={filters.only86}
            onChange={(e) => patch({ only86: e.target.checked })}
          />
          Só pratos em 86
        </label>
        <label className="map-check">
          <input
            type="checkbox"
            checked={filters.noReserve}
            onChange={(e) => patch({ noReserve: e.target.checked })}
          />
          Só insumos sem reserva
        </label>
      </div>
      <div className="map-legend">
        <span className="green">● Vendendo</span>
        <span className="red">● 86 aberto</span>
        <span className="amber">● Sem reserva</span>
        <span className="purple">● Fornecedor</span>
        <span>Anel = vencido / em aberto</span>
      </div>
      <section className="map-view" key={view} aria-label={`Visão ${view}`}>
        {view === "pareto" && <ParetoClient unit={filters.unit} units={data.units} />}
        {view === "dinheiro" && (
          <>
            <div className="map-section-title">
              <h2>O fluxo da receita.</h2>
              <p>Mais largo, mais valor. Toque no fornecedor para seguir o caminho completo.</p>
            </div>
            {!flow.sources.length ? (
              <p className="map-empty">
                Sem receita atribuída para estes filtros. Confira a ponte e os
                custos das fichas.
              </p>
            ) : (
              <>
                <div className="map-desktop">
                  <Sankey
                    flow={flow}
                    categoryFlow={categoryFlow}
                    suppliers={suppliers}
                    names={names}
                    hover={hover}
                    setHover={setHover}
                    open={openFocus}
                  />
                </div>
                <p className="map-legend-stage">
                  Espessura 1ª coluna = compra CMV (R$/ano) · Espessura 2ª coluna = receita atribuída (R$/ano)
                </p>
                <div className="map-mobile">
                  {flow.sources.map((s) => (
                    <div className="map-supplier-bar" key={s.id}>
                      <button className="map-supplier-name" onClick={() => openFocus(s.id)}>
                        {names.get(s.id) ?? s.id} ↗
                      </button>
                      <SupplierMetrics supplier={suppliers.find(v => v.raiz_cnpj === s.id)} />
                      <span
                        className="map-stacked"
                        style={{
                          width: `${(s.value / flow.sources[0]!.value) * 100}%`,
                        }}
                      >
                        {flow.links
                          .filter((l) => l.source === s.id)
                          .map((l, i) => (
                            <span
                              key={i}
                              className={l.color}
                              style={{ width: `${(l.value / s.value) * 100}%` }}
                              title={`${flow.targets.find((t) => t.id === l.target)?.name}: ${brl(l.value)}. ${amountSource}`}
                            />
                          ))}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        {view === "dependencia" && (
          <>
            <div className="map-section-title">
              <h2>Um fornecedor. Todo o efeito.</h2>
              <label>
                Fornecedor
                <select
                  value={focus}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {suppliers.map((s) => (
                    <option key={s.raiz_cnpj} value={s.raiz_cnpj}>
                      {s.nome}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {chosen ? (
              <>
                <Mindmap key={`${focus}:${filters.unit}`} edges={edges.filter(e => e.raiz_cnpj === focus)} allEdges={data.edges.filter(e => !filters.unit || e.unit_id === filters.unit)} blocks={blocks} supplier={chosen} units={data.units} names={names} today={data.today} reRoot={openFocus} openSupplier={openCard} />
                <div className="mindmap-list">
                <button className="map-root" onClick={() => openCard(focus)}>
                  <DebtRing supplier={chosen} />
                  <span>
                    <small>FORNECEDOR</small>
                    <strong>{chosen.nome}</strong>
                    <span>Abrir ficha e crédito ↗</span>
                  </span>
                </button>
                <Dependency
                  edges={edges.filter((e) => e.raiz_cnpj === focus)}
                  blocks={blocks}
                  data={data}
                  names={names}
                />
                </div>
              </>
            ) : (
              <p className="map-empty">
                O fornecedor selecionado não tem dados nesta casa. Selecione
                outro fornecedor.
              </p>
            )}
          </>
        )}
        {view === "travados" && (
          <>
            <div className="map-section-title">
              <h2>O que está travando a venda.</h2>
              <p>
                Receita média semanal, da maior para a menor. A causa ainda
                precisa ser confirmada quando indicada.
              </p>
            </div>
            <div className="map-blocks">
              {blockedDishes.map((e) => {
                const records = blocks.filter(
                    (b) => blockKey(b) === dishKey(e),
                  ),
                  first = records.map((b) => b.inicio).sort()[0];
                const dependencies = [
                  ...new Map(
                    edges
                      .filter((a) => dishKey(a) === dishKey(e))
                      .map((a) => [a.insumo_id, a]),
                  ).values(),
                ];
                return (
                  <article className="map-block" key={dishKey(e)}>
                    <div className="map-block-top">
                      <span className="map-badge red">86 ABERTO</span>
                      <small>
                        {data.units.find((u) => u.id === e.unit_id)?.name}
                      </small>
                    </div>
                    <h3>{e.prato}</h3>
                    <strong className="map-revenue">
                      <Metric source="Receita 12m da ponte / número de semanas da janela; média histórica, não previsão de recuperação.">
                        {compact(e.receita_semana)}
                      </Metric>
                      <small>/ semana · prévia</small>
                    </strong>
                    <p>
                      <Metric source="Dias desde o início confirmado ou o primeiro relatório operacional aberto.">{`${age(first!, data.today)} dias`}</Metric>{" "}
                      ·{" "}
                      <Metric source="Contagem de abastecimento_86.id abertos para este prato e casa.">{`${records.length} registros`}</Metric>
                    </p>
                    <p>
                      {records.every((r) => r.confirmado)
                        ? [
                            ...new Set(
                              records.map((r) => r.causa?.replaceAll("_", " ")),
                            ),
                          ].join(", ")
                        : "Causa a confirmar pela operação"}
                    </p>
                    {dependencies.map((d) => {
                      const root = d.principal_90d;
                      const supplier = suppliers.find(
                        (s) => s.raiz_cnpj === root,
                      );
                      return (
                        <button
                          key={d.insumo_id}
                          className="map-dependency"
                          disabled={!root}
                          onClick={() => root && openCard(root)}
                        >
                          <span>
                            {d.insumo}{" "}
                            <Metric source="Custo do insumo / custo completo da ficha Everest.">
                              {costLabel(d)}
                            </Metric>
                          </span>
                          <strong>
                            {root
                              ? (names.get(root) ?? root)
                              : "Sem fornecedor nos últimos 90 dias"}{" "}
                            ↗
                          </strong>
                          <small>
                            {Number(d.reserva)
                              ? `${d.reserva} reservas`
                              : "Sem reserva"}{" "}
                            · última compra {date(d.ultima_compra)}
                          </small>
                          <small>
                            Vencido:{" "}
                            <Metric source="Títulos ativos com saldo positivo vencidos antes de hoje; casa(s) selecionada(s). Fonte: v_mapa_titulo.">
                              {brl(Number(supplier?.vencido ?? 0))}
                            </Metric>
                          </small>
                        </button>
                      );
                    })}
                  </article>
                );
              })}
            </div>
            {!blockedDishes.length && (
              <p className="map-empty">
                Nenhum prato coberto pelo mapa tem registro de 86 aberto nestes
                filtros.
              </p>
            )}
            {!!uncovered.length && (
              <p className="map-warning">
                <Metric source="Registros abertos sem dependência de ficha confirmada no mapa.">{`${uncovered.length} registros`}</Metric>{" "}
                ainda sem dependência calculável.{" "}
                <Link href="/compras/abastecimento">Revisar a fila de 86 ↗</Link>
              </p>
            )}
          </>
        )}
      </section>
      {!!pendingPrices.length && (
        <section className="map-warning" aria-label="Pratos com atribuição pendente">
          <h2>Dependências com valor pendente</h2>
          <p>Estes pratos continuam no mapa. A receita atribuída é indeterminada e não compõe a espessura do fluxo até completar custos e fornecedores.</p>
          {pendingPrices.map(({ edge, ingredients }) => (
            <details key={dishKey(edge)}>
              <summary>{edge.prato} · {data.units.find((u) => u.id === edge.unit_id)?.name} · {edge.custo_completo ? "Sem fornecedor identificado" : "Ficha com custo incompleto"}</summary>
              <p>Receita do prato: {brl(Number(edge.receita_12m))} em 12 meses; não distribuída entre fornecedores.</p>
              <ul>{[...ingredients.values()].map((ingredient) => (
                <li key={ingredient.insumo_id}>{ingredient.insumo} · {costLabel(ingredient)}{ingredient.raiz_cnpj === null ? " · sem fornecedor identificado" : ""}</li>
              ))}</ul>
            </details>
          ))}
        </section>
      )}
      <footer className="map-foot">
        Prévia: fichas confirmadas. O fluxo financeiro exige custo completo; as demais dependências permanecem sinalizadas.
        Receita sem cobertura não vira zero. Abertura na fila de 86 não confirma
        a causa. Dados consultados em {date(data.readAt)}.
      </footer>
      {drawer && (
        <SupplierDrawer
          key={`${drawer}:${filters.unit}`}
          root={drawer}
          filters={filters}
          data={data}
          supplier={suppliers.find((s) => s.raiz_cnpj === drawer)}
          close={() => setDrawer(null)}
        />
      )}
    </main>
  );
}

function DebtRing({ supplier }: { supplier: MapSupplier }) {
  const ratio =
    Number(supplier.em_aberto) > 0
      ? Number(supplier.vencido) / Number(supplier.em_aberto)
      : 0;
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 44 44"
      role="img"
      aria-label={`Vencido ${brl(supplier.vencido)} de ${brl(supplier.em_aberto)} em aberto`}
    >
      <title>Vencido / em aberto. Fonte: títulos ativos Everest.</title>
      <circle
        cx="22"
        cy="22"
        r="17"
        fill="none"
        stroke="#393149"
        strokeWidth="4"
      />
      <circle
        cx="22"
        cy="22"
        r="17"
        fill="none"
        stroke="#ed7778"
        strokeWidth="4"
        strokeDasharray={`${ratio * 106.81} 106.81`}
        transform="rotate(-90 22 22)"
      />
      <circle cx="22" cy="22" r="7" fill="#b5a0df" />
    </svg>
  );
}
function Sankey({
  flow,
  categoryFlow,
  suppliers,
  names,
  hover,
  setHover,
  open,
}: {
  flow: ReturnType<typeof buildFlow>;
  categoryFlow: CategoryFlow;
  suppliers: MapSupplier[];
  names: Map<string, string>;
  hover: string | null;
  setHover: (v: string | null) => void;
  open: (v: string) => void;
}) {
  const flowSupplierIds = new Set(flow.sources.map((s) => s.id));

  // Filtrar catLinks para apenas fornecedores que aparecem no S2
  const catLinks = categoryFlow.catLinks.filter((l) => flowSupplierIds.has(l.raiz_cnpj));

  // catId → Set<raiz_cnpj> e raiz_cnpj → Set<catId>
  const catToSuppliersMap = new Map<string, Set<string>>();
  const supplierToCatsMap = new Map<string, Set<string>>();
  for (const l of catLinks) {
    const cs = catToSuppliersMap.get(l.catId) ?? new Set<string>();
    cs.add(l.raiz_cnpj);
    catToSuppliersMap.set(l.catId, cs);
    const sc = supplierToCatsMap.get(l.raiz_cnpj) ?? new Set<string>();
    sc.add(l.catId);
    supplierToCatsMap.set(l.raiz_cnpj, sc);
  }

  const nCats = categoryFlow.categories.length;
  const height = Math.max(
    650,
    Math.max(nCats, flow.sources.length, flow.targets.length) * 65 + 420,
  );
  // Scale S2 (fornecedor→prato)
  const scaleS2 =
    (height - 50 - Math.max(flow.sources.length, flow.targets.length) * 60) /
    flow.total;
  // Scale S1 (categoria→fornecedor): proporcional ao CMV total
  const scaleS1 =
    categoryFlow.total > 0
      ? (height - 50 - Math.max(nCats, flow.sources.length) * 60) /
        categoryFlow.total
      : scaleS2;

  // Layout de categorias (S1 — lado esquerdo)
  const catYMap = new Map<string, { y: number; offset: number }>();
  let catY = 28;
  for (const cat of categoryFlow.categories) {
    catYMap.set(cat.id, { y: catY, offset: 0 });
    catY += cat.value * scaleS1 + 60;
  }

  // Fornecedores
  const sourcesLayout = new Map<string, { y: number; offset: number }>();
  let sy = 28;
  for (const s of flow.sources) {
    sourcesLayout.set(s.id, { y: sy, offset: 0 });
    sy += s.value * scaleS2 + 60;
  }

  // Pratos
  const targetsLayout = new Map<string, { y: number; offset: number }>();
  let ty = 28;
  for (const t of flow.targets) {
    targetsLayout.set(t.id, { y: ty, offset: 0 });
    ty += t.value * scaleS2 + 60;
  }

  // Hover de 3 estágios: categoria → fornecedor → prato (e inverso)
  const catIds = new Set(categoryFlow.categories.map((c) => c.id));

  let activeCats: Set<string> | null = null;
  let activeSuppliers: Set<string> | null = null;
  let activeDishes: Set<string> | null = null;

  if (hover) {
    activeCats = new Set<string>();
    activeSuppliers = new Set<string>();
    activeDishes = new Set<string>();

    if (catIds.has(hover)) {
      // hover = categoria
      activeCats.add(hover);
      for (const s of catToSuppliersMap.get(hover) ?? new Set<string>()) {
        activeSuppliers.add(s);
      }
    } else if (flowSupplierIds.has(hover)) {
      // hover = fornecedor
      activeSuppliers.add(hover);
      for (const c of supplierToCatsMap.get(hover) ?? new Set<string>()) {
        activeCats.add(c);
      }
    } else {
      // hover = prato
      activeDishes.add(hover);
      for (const l of flow.links) {
        if (l.target === hover) {
          activeSuppliers.add(l.source);
          for (const c of supplierToCatsMap.get(l.source) ?? new Set<string>()) {
            activeCats.add(c);
          }
        }
      }
    }
    // Propagar fornecedores → pratos
    for (const s of activeSuppliers) {
      for (const l of flow.links) {
        if (l.source === s) activeDishes.add(l.target);
      }
    }
  }

  const nodeOp = (id: string, active: Set<string> | null) =>
    !hover ? 1 : active?.has(id) ? 1 : 0.08;
  const s1Op = (catId: string, rcnpj: string) =>
    !hover ? 0.6 : activeCats?.has(catId) && activeSuppliers?.has(rcnpj) ? 0.6 : 0.08;
  const s2Op = (src: string, tgt: string) =>
    !hover ? 0.6 : activeSuppliers?.has(src) && activeDishes?.has(tgt) ? 0.6 : 0.08;

  // Offsets para links S1 (categoria→fornecedor)
  const catOffsets = new Map(
    [...catYMap.entries()].map(([k, v]) => [k, { y: v.y, offset: 0 }]),
  );
  const sourceOffsetsS1 = new Map(
    flow.sources.map((s) => [s.id, { y: sourcesLayout.get(s.id)!.y, offset: 0 }]),
  );

  // Offsets para links S2 (cópia de sourcesLayout/targetsLayout)
  const sourceOffsetsS2 = new Map(
    flow.sources.map((s) => [s.id, { y: sourcesLayout.get(s.id)!.y, offset: 0 }]),
  );
  const targetOffsetsS2 = new Map(
    flow.targets.map((t) => [t.id, { y: targetsLayout.get(t.id)!.y, offset: 0 }]),
  );

  // Pré-computado para evitar O(n²) no tooltip dos links S2
  const targetNameMap = new Map(flow.targets.map((t) => [t.id, t.name]));

  return (
    <svg
      className="map-flow"
      viewBox={`0 0 1800 ${height}`}
      role="group"
      aria-label="Fluxo categorias para fornecedores para pratos, espessura proporcional ao CMV e receita atribuída"
    >
      <text x="12" y="14" className="map-svg-caption">
        R$ QUE SAI DO CAIXA · CATEGORIAS
      </text>
      <text x="680" y="14" className="map-svg-caption">
        FORNECEDORES
      </text>
      <text x="1460" y="14" className="map-svg-caption">
        VIRA VENDA · PRATOS
      </text>

      {/* Links S1: categorias → fornecedores */}
      {(() => {
        const catOrder = new Map(categoryFlow.categories.map((c, i) => [c.id, i]));
        const supOrder = new Map(flow.sources.map((s, i) => [s.id, i]));
        const sorted = [...catLinks].sort(
          (a, b) =>
            (catOrder.get(a.catId) ?? 999) - (catOrder.get(b.catId) ?? 999) ||
            (supOrder.get(a.raiz_cnpj) ?? 999) - (supOrder.get(b.raiz_cnpj) ?? 999),
        );
        return sorted.map((l) => {
          const c = catOffsets.get(l.catId);
          const s = sourceOffsetsS1.get(l.raiz_cnpj);
          if (!c || !s) return null;
          const width = l.value * scaleS1;
          const y1 = c.y + c.offset + width / 2;
          const y2 = s.y + s.offset + width / 2;
          c.offset += width;
          s.offset += width;
          const catDisplay = l.catId === "outras" ? "Outras" : categoryName(l.catId);
          return (
            <path
              key={`s1-${l.catId}-${l.raiz_cnpj}`}
              d={`M 90 ${y1} C 330 ${y1}, 590 ${y2}, 762 ${y2}`}
              strokeWidth={width}
              className="map-flow-link green"
              opacity={s1Op(l.catId, l.raiz_cnpj)}
              onMouseEnter={() => setHover(l.catId)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(l.catId)}
              onBlur={() => setHover(null)}
            >
              <title>{`${catDisplay} → ${names.get(l.raiz_cnpj) ?? l.raiz_cnpj}: ${compact(l.value)}/ano · compra real (notas fiscais 12m)`}</title>
            </path>
          );
        });
      })()}

      {/* Links S2: fornecedores → pratos */}
      {flow.links.map((l, i) => {
        const s = sourceOffsetsS2.get(l.source)!;
        const t = targetOffsetsS2.get(l.target)!;
        const width = l.value * scaleS2;
        const y1 = s.y + s.offset + width / 2;
        const y2 = t.y + t.offset + width / 2;
        s.offset += width;
        t.offset += width;
        const label = `${names.get(l.source)} → ${targetNameMap.get(l.target) ?? l.target}: ${brl(l.value)}. ${amountSource}`;
        return (
          <path
            key={`s2-${i}`}
            d={`M 774 ${y1} C 1000 ${y1}, 1200 ${y2}, 1450 ${y2}`}
            strokeWidth={width}
            className={`map-flow-link ${l.color}`}
            opacity={s2Op(l.source, l.target?.toString())}
            tabIndex={0}
            role="button"
            aria-label={label}
            onFocus={() => setHover(l.source)}
            onBlur={() => setHover(null)}
            onMouseEnter={() => setHover(l.source)}
            onMouseLeave={() => setHover(null)}
            onClick={() => open(l.source)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                open(l.source);
              }
            }}
          >
            <title>{label}</title>
          </path>
        );
      })}

      {/* Nós de CATEGORIAS */}
      {categoryFlow.categories.map((cat) => {
        const layout = catYMap.get(cat.id)!;
        const h = cat.value * scaleS1;
        const catDisplay = cat.id === "outras" ? "Outras" : categoryName(cat.id);
        return (
          <g
            key={cat.id}
            className="map-svg-node"
            tabIndex={0}
            role="button"
            aria-label={`${catDisplay}. ${compact(cat.value)}/ano compra real.`}
            opacity={nodeOp(cat.id, activeCats)}
            onMouseEnter={() => setHover(cat.id)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(cat.id)}
            onBlur={() => setHover(null)}
          >
            <title>{`${catDisplay} · ${compact(cat.value)}/ano · compra real (notas fiscais 12m)`}</title>
            <rect x="80" y={layout.y} width="10" height={h} rx="2" fill="#b5a0df" />
            <text x="96" y={layout.y + h / 2 - 5}>{catDisplay.slice(0, 22)}</text>
            <text x="96" y={layout.y + h / 2 + 11} className="map-svg-value">
              {`${compact(cat.value)}/ano`}
            </text>
          </g>
        );
      })}

      {/* Nós de FORNECEDORES */}
      {flow.sources.map((s) => {
        const layout = sourcesLayout.get(s.id)!;
        const h = s.value * scaleS2;
        const v = suppliers.find((r) => r.raiz_cnpj === s.id);
        const ratio =
          v && Number(v.em_aberto) > 0
            ? Number(v.vencido) / Number(v.em_aberto)
            : 0;
        const spend = v?.gasto_12m == null ? null : Number(v.gasto_12m);
        const revenue =
          v?.receita_atribuida == null ? null : Number(v.receita_atribuida);
        const leverage =
          spend !== null && spend > 0 && revenue !== null
            ? revenue / spend
            : null;
        const subLabel =
          spend !== null
            ? `Compra ${compact(spend)}/ano${leverage !== null ? ` · Alavanca ${leverage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x` : ""}`
            : null;
        const cy = layout.y + h / 2;
        return (
          <g
            key={s.id}
            className="map-svg-node"
            tabIndex={0}
            role="button"
            aria-label={`${names.get(s.id)}. ${supplierMetrics(v).map((m) => m.label).join(". ")}. Abrir dependência.`}
            onClick={() => open(s.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                open(s.id);
              }
            }}
            onFocus={() => setHover(s.id)}
            onBlur={() => setHover(null)}
            onMouseEnter={() => setHover(s.id)}
            onMouseLeave={() => setHover(null)}
            opacity={nodeOp(s.id, activeSuppliers)}
          >
            <title>{`Vencido / em aberto: ${pct(ratio)}. ${amountSource}`}</title>
            <circle cx="754" cy={cy} r="9" stroke="#443b55" strokeWidth="3" fill="none" />
            <circle
              cx="754"
              cy={cy}
              r="9"
              stroke="#ed7778"
              strokeWidth="3"
              fill="none"
              strokeDasharray={`${ratio * 56.55} 56.55`}
            />
            <rect x="764" y={layout.y} width="10" height={h} rx="2" fill="#b5a0df" />
            <text x="742" y={cy - 5} textAnchor="end">
              {(names.get(s.id) ?? s.id).slice(0, 24)}
            </text>
            {subLabel && (
              <text x="742" y={cy + 11} textAnchor="end" className="map-svg-value">
                {subLabel}
              </text>
            )}
          </g>
        );
      })}

      {/* Nós de PRATOS */}
      {flow.targets.map((t) => {
        const y = targetsLayout.get(t.id)!.y;
        return (
          <g
            key={t.id}
            tabIndex={0}
            role="img"
            aria-label={`${t.name}: ${brl(t.value)} de receita atribuída`}
            onFocus={() => setHover(t.id)}
            onBlur={() => setHover(null)}
            onMouseEnter={() => setHover(t.id)}
            onMouseLeave={() => setHover(null)}
            opacity={nodeOp(t.id, activeDishes)}
          >
            <title>{amountSource}</title>
            <rect
              x="1450"
              y={y}
              width="7"
              height={t.value * scaleS2}
              fill="#839087"
            />
            <text x="1465" y={y + (t.value * scaleS2) / 2 - 3}>
              {t.name.slice(0, 32)}
            </text>
            <text
              x="1465"
              y={y + (t.value * scaleS2) / 2 + 13}
              className="map-svg-value"
            >
              {compact(t.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Dependency({
  edges,
  blocks,
  data,
  names,
}: {
  edges: MapEdge[];
  blocks: MapBlock[];
  data: Data;
  names: Map<string, string>;
}) {
  const items = new Map<string, MapEdge[]>();
  for (const e of edges) {
    const key = `${e.unit_id}:${e.insumo_id}`;
    items.set(key, [...(items.get(key) ?? []), e]);
  }
  return (
    <div className="map-tree">
      {[...items].map(([key, list]) => {
        const e = list[0]!,
          old =
            e.ultima_compra &&
            age(e.ultima_compra, data.today) > PRISMA.mapaStalePurchaseDays;
        return (
          <article key={key} className="map-branch">
            <div className="map-ingredient">
              <small>
                {data.units.find((u) => u.id === e.unit_id)?.name} · INSUMO
              </small>
              <h3>{e.insumo}</h3>
              <span
                className={`map-badge ${Number(e.reserva) ? "neutral" : "amber"}`}
              >
                <Metric source="Outras raízes unificadas que compraram o mesmo item no grupo em 12m + alternativas explicitamente homologadas e vigentes na matriz de marcas.">
                  {Number(e.reserva) ? `${e.reserva} reservas` : "Sem reserva"}
                </Metric>
              </span>
              <p className={old ? "amber" : ""}>
                <Metric source="Maior data da nota de compra do insumo nesta casa; alerta após 45 dias. Fonte: v_mapa_insumo.">{`${old ? "⚠ " : ""}Última compra ${date(e.ultima_compra)}`}</Metric>
              </p>
              <p>
                Principal 90d:{" "}
                {e.principal_90d
                  ? (names.get(e.principal_90d) ?? e.principal_90d)
                  : "Sem compra recente"}
              </p>
              {e.fornecedor_trocou && (
                <span
                  className="map-badge purple"
                  title={`Maior share por quantidade em 90d difere de 12m. Anual: ${names.get(e.principal_12m ?? "") ?? e.principal_12m}. Fonte: v_mapa_share.`}
                >
                  Fornecedor trocou
                </span>
              )}
            </div>
            <div className="map-branch-dishes">
              {list.map((d) => {
                const b = blocks.filter((b) => blockKey(b) === dishKey(d));
                return (
                  <div
                    key={d.produto_venda_ficha_id}
                    className={`map-tree-dish ${b.length ? "blocked" : ""}`}
                  >
                    <h4>{d.prato}</h4>
                    <p>
                      <Metric source="Receita da ponte em 12m / semanas da janela. Média histórica, prévia.">{`${compact(d.receita_semana)} / semana`}</Metric>
                    </p>
                    <p>
                      <Metric source="Custo do insumo / custo completo da ficha × 100. Preço de compra; na ausência, último custo histórico Everest da mesma casa. Sem custo completo, peso indeterminado.">{costLabel(d)}</Metric>
                      {isCritical(d) && (
                        <span className="amber"> · crítico</span>
                      )}
                    </p>
                    {!!b.length && (
                      <span
                        className="map-badge red"
                        title="Fonte: abastecimento_86 aberto, ligação confirmada ou sugerida; não comprova causa."
                      >
                        86 desde{" "}
                        {date(b.map((r) => r.inicio).sort()[0] ?? null)} ·{" "}
                        {b.length} registros
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </article>
        );
      })}
      {!items.size && (
        <p className="map-empty">
          Sem dependências deste fornecedor para os filtros selecionados.
        </p>
      )}
    </div>
  );
}

function SupplierDrawer({
  root,
  filters,
  data,
  supplier,
  close,
}: {
  root: string;
  filters: MapFilters;
  data: Data;
  supplier: MapSupplier | undefined;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [detail, setDetail] = useState<Awaited<
      ReturnType<typeof getMapSupplierDetail>
    > | null>(null);
  const [limit, setLimit] = useState(""),
    [term, setTerm] = useState(""),
    [note, setNote] = useState(""),
    [leadTime, setLeadTime] = useState("3"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [savedLimit, setSavedLimit] = useState<number | null>(
    supplier?.limite_rs ?? null,
  );
  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  useEffect(() => {
    let active = true;
    getMapSupplierDetail({ root, unit: filters.unit || null })
      .then((d) => {
        if (!active) return;
        setDetail(d);
        setLimit(d.credit?.limite_rs == null ? "" : String(d.credit.limite_rs));
        setSavedLimit(d.credit?.limite_rs ?? null);
        setTerm(
          d.credit?.prazo_dias_acordado == null
            ? ""
            : String(d.credit.prazo_dias_acordado),
        );
        setNote(d.credit?.observacao ?? "");
        setLeadTime(
          d.credit?.lead_time_dias == null ? "3" : String(d.credit.lead_time_dias),
        );
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [root, filters.unit]);
  const titles = data.titles.filter(
    (t) =>
      t.raiz_cnpj === root && (!filters.unit || t.unit_id === filters.unit),
  );
  const timeline = titleTimeline(titles),
    open = titles.reduce((s, t) => s + Number(t.vl_saldo), 0);
  // A global limit always compares with global balance. The view exposes available credit from all houses.
  const groupOpen =
    supplier?.limite_rs != null && supplier.disponivel != null
      ? Number(supplier.limite_rs) - Number(supplier.disponivel)
      : data.titles
          .filter((t) => t.raiz_cnpj === root)
          .reduce((s, t) => s + Number(t.vl_saldo), 0);
  const color = creditColor(groupOpen, savedLimit),
    ratio =
      savedLimit && savedLimit > 0
        ? Math.min(groupOpen / savedLimit, 1)
        : groupOpen > 0
          ? 1
          : 0;
  const scoped = data.suppliers.filter(
      (s) => !filters.unit || s.unit_id === filters.unit,
    ),
    byRoot = aggregateSuppliers(scoped),
    position = byRoot.findIndex((s) => s.raiz_cnpj === root) + 1;
  const spend = byRoot.reduce((s, r) => s + Number(r.gasto_12m), 0),
    houseTotals = [...new Map(scoped.map((s) => [s.unit_id, s])).values()];
  const revenue = houseTotals.reduce(
      (s, r) => s + Number(r.receita_total ?? 0),
      0,
    ),
    sold = houseTotals.reduce((s, r) => s + Number(r.pratos_vendidos ?? 0), 0);
  async function act(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="map-drawer"
      aria-labelledby="map-supplier-title"
      onCancel={close}
    >
      <button
        className="map-close"
        aria-label="Fechar ficha do fornecedor"
        onClick={close}
      >
        ×
      </button>
      <p className="map-eyebrow">FICHA DO FORNECEDOR</p>
      <h2 id="map-supplier-title">{supplier?.nome ?? root}</h2>
      <SupplierMetrics supplier={supplier} />
      <p>
        {filters.unit
          ? data.units.find((u) => u.id === filters.unit)?.name
          : "Casas autorizadas"}{" "}
        · títulos na posição de {date(data.today)}
      </p>
      {error && (
        <p role="alert" className="map-warning">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="map-notice">
          {notice}
        </p>
      )}
      <section className="map-credit">
        <h3>Espaço para comprar.</h3>
        <p>
          <Metric source="Saldo em aberto do fornecedor no grupo / limite cadastrado em compras_fornecedor_credito. O limite é único no grupo.">{`${brl(groupOpen)} em aberto`}</Metric>
          <span>
            {" "}
            / {savedLimit === null ? "limite não cadastrado" : brl(savedLimit)}
          </span>
        </p>
        <div
          className={`map-credit-track ${color}`}
          role="meter"
          aria-label="Uso do limite de crédito do grupo"
          aria-valuemin={0}
          aria-valuemax={savedLimit ?? 0}
          aria-valuenow={Math.min(groupOpen, savedLimit ?? 0)}
          aria-valuetext={
            savedLimit === null
              ? "Limite não cadastrado"
              : `${brl(groupOpen)} de ${brl(savedLimit)}`
          }
        >
          <span style={{ width: `${ratio * 100}%` }} />
        </div>
        <p className={color}>
          {savedLimit === null
            ? "Cadastre o limite para avaliar disponibilidade."
            : groupOpen > savedLimit
              ? "Limite estourado"
              : `${brl(savedLimit - groupOpen)} disponíveis no grupo`}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              const r = await saveMapCredit({
                raiz_cnpj: root,
                limite_rs: limit === "" ? null : Number(limit),
                prazo_dias_acordado: term === "" ? null : Number(term),
                observacao: note,
                lead_time_dias: leadTime === "" ? 3 : Math.max(1, Math.min(90, Number(leadTime) || 3)),
              });
              setSavedLimit(r.limite_rs);
            }, "Limite e prazo gravados.");
          }}
        >
          <label>
            Limite do grupo (R$)
            <input
              name="limite"
              type="number"
              min="0"
              step="0.01"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              disabled={!data.canEditCredit || !detail}
            />
          </label>
          <label>
            Prazo acordado (dias)
            <input
              type="number"
              min="0"
              max="365"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              disabled={!data.canEditCredit || !detail}
            />
          </label>
          <div style={{ marginTop: 12 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>
              Lead time (dias de entrega)
            </label>
            <input
              type="number"
              min="1"
              max="90"
              value={leadTime}
              onChange={(e) => setLeadTime(e.target.value)}
              disabled={!data.canEditCredit || !detail}
              style={{
                width: 80,
                padding: "4px 8px",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                fontSize: 13,
              }}
              title="Prazo de entrega em dias — usado para calcular o ponto de pedido"
            />
          </div>
          <label>
            Observação
            <input
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
              disabled={!data.canEditCredit || !detail}
            />
          </label>
          <button
            className="map-primary"
            disabled={busy || !data.canEditCredit || !detail}
          >
            Salvar crédito
          </button>
        </form>
        {!data.canEditCredit && (
          <p>
            Seu perfil pode consultar. A edição do limite exige acesso ao grupo.
          </p>
        )}
      </section>
      <section>
        <h3>Boletos no tempo.</h3>
        <p>
          <Metric source="Soma de vl_saldo dos títulos Everest com ds_situacao Ativo e saldo positivo, nas casas selecionadas. Cada id aparece uma vez.">{`${brl(open)} em aberto · ${titles.length} títulos`}</Metric>
        </p>
        <svg
          className="map-timeline"
          viewBox="0 0 500 150"
          role="img"
          aria-label="Vencimentos de 100 dias atrás até 45 dias à frente"
        >
          <line x1="20" x2="480" y1="80" y2="80" stroke="#56615a" />
          <line
            x1={20 + (100 / 145) * 460}
            x2={20 + (100 / 145) * 460}
            y1="15"
            y2="112"
            stroke="#f0e7d8"
            strokeDasharray="3 4"
          />
          <text x="20" y="138">
            −100 dias
          </text>
          <text x={20 + (100 / 145) * 460} y="138" textAnchor="middle">
            hoje
          </text>
          <text x="480" y="138" textAnchor="end">
            +45 dias
          </text>
          {timeline.days.map((d) => (
            <circle
              key={d.date}
              cx={20 + ((d.days + 100) / 145) * 460}
              cy="80"
              r={
                Math.sqrt(
                  d.value / Math.max(...timeline.days.map((d) => d.value), 1),
                ) * 30
              }
              className={
                d.days < -30 ? "red" : d.days < 0 ? "amber" : "neutral"
              }
              stroke={d.agreement ? "#eee5d9" : "transparent"}
              strokeWidth="2"
              strokeDasharray={d.agreement ? "4 3" : undefined}
              tabIndex={0}
              aria-label={`${date(d.date)}, ${brl(d.value)}, ${d.count} títulos${d.agreement ? ", inclui acordo" : ""}`}
            >
              <title>
                {date(d.date)} · {brl(d.value)} · {d.count} títulos. Área
                proporcional ao saldo. Fonte: v_mapa_titulo.
              </title>
            </circle>
          ))}
        </svg>
        <p>
          Tracejado = inclui parcela de acordo. Vermelho: mais de 30 dias
          vencido; âmbar: até 30; cinza: a vencer.
        </p>
        <p className="amber">
          ◂{" "}
          <Metric source="Saldo vencido há mais de 120 dias; subconjunto de vencido. Não somar novamente ao aberto.">{`${brl(timeline.conciliar)} a conciliar`}</Metric>
        </p>
        {timeline.outside > 0 && (
          <p>
            <Metric source="Vencimentos entre 101 e 120 dias atrás ou além de 45 dias à frente, fora do eixo visual, incluídos no saldo total.">{`${brl(timeline.outside)} fora do eixo`}</Metric>
          </p>
        )}
        {timeline.unknown > 0 && (
          <p>{brl(timeline.unknown)} sem data de vencimento</p>
        )}
      </section>
      {supplier && (
        <section>
          <h3>O lugar no mix.</h3>
          <div className="map-mix">
            <Metric source="Compras CMV do fornecedor / compras CMV das casas selecionadas em 12m; posição decrescente por gasto, v_mapa_fornecedor.">{`${pct(spend ? Number(supplier.gasto_12m) / spend : 0)} das compras · ${position} de ${byRoot.length}`}</Metric>
            <Metric source="Compras do fornecedor no grupo / compras de todo o grupo, v_mapa_fornecedor.">{`${pct(Number(supplier.pct_compras_grupo))} das compras do grupo`}</Metric>
            <Metric source="Receita atribuída do fornecedor / receita de todos os pratos da ponte nas casas selecionadas, confirmados ou não.">{`${pct(revenue ? Number(supplier.receita_atribuida) / revenue : 0)} da receita · prévia`}</Metric>
            <Metric source="Pratos distintos dependentes por casa / pratos vendidos por casa, v_mapa_aresta e produto_venda_ficha.">{`${supplier.pratos_dependentes} pratos de ${sold} vendidos`}</Metric>
          </div>
          <p
            className="map-badge purple"
            title="Mesmos limiares de Âncoras: receita atribuída, gasto e nota de desempenho do Prisma. Grupos usam nota ponderada pelo gasto."
          >
            {detail?.profile ?? "Conferindo perfil de Âncoras…"}
          </p>
        </section>
      )}
      <div className="map-actions">
        <button
          disabled={busy || !filters.unit}
          onClick={() =>
            void act(async () => {
              const r = await createMapAgreement({ root, unit: filters.unit });
              setNotice(`Rascunho ${r.id} criado. Revise antes de negociar.`);
            }, "Rascunho criado com dívida e pratos confirmados. Revise entrega, compra nova e contribuição em Acordos.")
          }
        >
          Abrir acordo
        </button>
        <a href={`/compras/abastecimento?unit=${filters.unit}&f=${root}`}>
          Ver na fila de 86 ↗
        </a>
        <button
          disabled={busy}
          onClick={() =>
            void act(async () => {
              const end = data.today,
                start = new Date(`${end}T12:00:00Z`);
              start.setUTCFullYear(start.getUTCFullYear() - 1);
              await addPrismaPlan({
                root,
                filter: {
                  unitId: filters.unit || null,
                  start: start.toISOString().slice(0, 10),
                  end,
                },
              });
            }, "Fornecedor levado ao plano de ação.")
          }
        >
          Levar ao plano
        </button>
        <Link href="/compras/abastecimento/acordos">Revisar acordos ↗</Link>
      </div>
      {!filters.unit && <p>Selecione uma casa no mapa para abrir acordo.</p>}
    </dialog>
  );
}
