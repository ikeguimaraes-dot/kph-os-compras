"use client";
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
  buildFlow,
  creditColor,
  dishKey,
  edgeAmount,
  filterMap,
  isCritical,
  mapView,
  titleTimeline,
  type MapBlock,
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
  const coveredIds = new Set(data.edges.map(dishKey));
  const uncovered = blocks.filter((b) => !coveredIds.has(blockKey(b)));
  return (
    <main className="mapa">
      <nav className="map-nav" aria-label="Prisma">
        <a href="/compras/prisma">← Cockpit</a>
        <a href="/compras/abastecimento">Rotina de abastecimento ↗</a>
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
        {(["dinheiro", "dependencia", "travados"] as const).map((v, i) => (
          <button
            key={v}
            aria-pressed={view === v}
            aria-keyshortcuts={String(i + 1)}
            onClick={() => setView(v)}
          >
            <span aria-hidden="true">{["↝", "⌘", "⊘"][i]}</span>
            {["Dinheiro", "Dependência", "Travados"][i]}
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
        {view === "dinheiro" && (
          <>
            <div className="map-section-title">
              <h2>O fluxo da receita.</h2>
              <p>
                Mais largo, mais receita atribuída. Toque no fornecedor para
                seguir o caminho.
              </p>
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
                    suppliers={suppliers}
                    names={names}
                    hover={hover}
                    setHover={setHover}
                    open={openFocus}
                  />
                </div>
                <div className="map-mobile">
                  {flow.sources.map((s) => (
                    <button
                      className="map-supplier-bar"
                      key={s.id}
                      onClick={() => openFocus(s.id)}
                    >
                      <span>
                        {names.get(s.id) ?? s.id}
                        <b>{compact(s.value)}</b>
                      </span>
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
                    </button>
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
                              {pct(d.peso_custo)}
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
                <Metric source="Registros abertos sem aresta com ficha confirmada, custo completo e fornecedor identificado.">{`${uncovered.length} registros`}</Metric>{" "}
                ainda sem dependência calculável.{" "}
                <a href="/compras/abastecimento">Revisar a fila de 86 ↗</a>
              </p>
            )}
          </>
        )}
      </section>
      <footer className="map-foot">
        Prévia: somente fichas confirmadas e com todos os custos conhecidos.
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
  suppliers,
  names,
  hover,
  setHover,
  open,
}: {
  flow: ReturnType<typeof buildFlow>;
  suppliers: MapSupplier[];
  names: Map<string, string>;
  hover: string | null;
  setHover: (v: string | null) => void;
  open: (v: string) => void;
}) {
  const height = Math.max(650, flow.sources.length * 31 + 420),
    scale =
      (height - 50 - Math.max(flow.sources.length, flow.targets.length) * 28) /
      flow.total;
  const sources = new Map<string, { y: number; offset: number }>(),
    targets = new Map<string, { y: number; offset: number }>();
  let sy = 28,
    ty = 28;
  for (const s of flow.sources) {
    sources.set(s.id, { y: sy, offset: 0 });
    sy += s.value * scale + 28;
  }
  for (const t of flow.targets) {
    targets.set(t.id, { y: ty, offset: 0 });
    ty += t.value * scale + 28;
  }
  return (
    <svg
      className="map-flow"
      viewBox={`0 0 1120 ${height}`}
      role="group"
      aria-label="Fluxo fornecedor para prato, espessura proporcional à receita atribuída"
    >
      <text x="12" y="14" className="map-svg-caption">
        FORNECEDORES
      </text>
      <text x="850" y="14" className="map-svg-caption">
        PRATOS · TOP 12 + OUTROS
      </text>
      {flow.links.map((l, i) => {
        const s = sources.get(l.source)!,
          t = targets.get(l.target)!,
          width = l.value * scale,
          y1 = s.y + s.offset + width / 2,
          y2 = t.y + t.offset + width / 2;
        s.offset += width;
        t.offset += width;
        const label = `${names.get(l.source)} → ${flow.targets.find((t) => t.id === l.target)?.name}: ${brl(l.value)}. ${amountSource}`;
        return (
          <path
            key={i}
            d={`M 270 ${y1} C 520 ${y1}, 600 ${y2}, 835 ${y2}`}
            strokeWidth={width}
            className={`map-flow-link ${l.color}`}
            opacity={
              hover && hover !== l.source && hover !== l.target?.toString()
                ? 0.08
                : 0.6
            }
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
      {flow.sources.map((s) => {
        const y = sources.get(s.id)!.y,
          h = s.value * scale,
          v = suppliers.find((r) => r.raiz_cnpj === s.id),
          ratio =
            v && Number(v.em_aberto) > 0
              ? Number(v.vencido) / Number(v.em_aberto)
              : 0;
        return (
          <g
            key={s.id}
            className="map-svg-node"
            tabIndex={0}
            role="button"
            aria-label={`${names.get(s.id)}: ${brl(s.value)}. Abrir dependência.`}
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
            opacity={
              hover &&
              hover !== s.id &&
              !flow.links.some((l) => l.source === s.id && l.target === hover)
                ? 0.08
                : 1
            }
          >
            <title>
              {amountSource} Vencido / em aberto: {pct(ratio)}.
            </title>
            <rect x="260" y={y} width="10" height={h} rx="2" fill="#b5a0df" />
            <circle
              cx="17"
              cy={y + h / 2}
              r="9"
              stroke="#443b55"
              strokeWidth="3"
              fill="none"
            />
            <circle
              cx="17"
              cy={y + h / 2}
              r="9"
              stroke="#ed7778"
              strokeWidth="3"
              fill="none"
              strokeDasharray={`${ratio * 56.55} 56.55`}
            />
            <text x="35" y={y + h / 2 - 3}>
              {(names.get(s.id) ?? s.id).slice(0, 26)}
            </text>
            <text x="35" y={y + h / 2 + 13} className="map-svg-value">
              {compact(s.value)}
            </text>
          </g>
        );
      })}
      {flow.targets.map((t) => {
        const y = targets.get(t.id)!.y;
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
            opacity={
              hover &&
              hover !== t.id &&
              !flow.links.some((l) => l.target === t.id && l.source === hover)
                ? 0.08
                : 1
            }
          >
            <title>{amountSource}</title>
            <rect
              x="835"
              y={y}
              width="7"
              height={t.value * scale}
              fill="#839087"
            />
            <text x="853" y={y + (t.value * scale) / 2 - 3}>
              {t.name.slice(0, 32)}
            </text>
            <text
              x="853"
              y={y + (t.value * scale) / 2 + 13}
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
                  title={`Maior share por quantidade em 90d difere de 12m. Anual: ${names.get(e.principal_12m) ?? e.principal_12m}. Fonte: v_mapa_share.`}
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
                      <Metric source="Custo do insumo / custo completo da ficha × 100; v_ficha_explodida e v_preco_medio_compra.">{`${pct(d.peso_custo)} do custo`}</Metric>
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
        <a href="/compras/abastecimento/acordos">Revisar acordos ↗</a>
      </div>
      {!filters.unit && <p>Selecione uma casa no mapa para abrir acordo.</p>}
    </dialog>
  );
}
