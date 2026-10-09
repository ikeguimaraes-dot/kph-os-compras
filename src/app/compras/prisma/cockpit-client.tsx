"use client";
import { useAuth } from "@kph/auth/context";
import { resolveUnitScope } from "@/lib/compras/unit-scope";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  getCockpit,
  saveCockpitTarget,
  saveOwnerTarget,
  addMenuPlan,
  type CockpitFilter,
} from "@/lib/compras/prisma-cockpit-actions";
import { addPrismaPlan } from "@/lib/compras/prisma-actions";
import {
  monthEnd,
  shiftMonth,
  type Cockpit,
} from "@/lib/compras/prisma-cockpit";
import { supplierAction } from "@/lib/compras/prisma-config";
import "./cockpit.css";
const money = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 2,
      });
const pct = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const pp = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : `${n > 0 ? "+" : ""}${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} p.p.`;
const label = (m: string | undefined) =>
  m
    ? new Date(`${m}T12:00:00Z`).toLocaleDateString("pt-BR", {
        month: "short",
        year: "2-digit",
      })
    : "—";
const num = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
function Formula({ children }: { children: ReactNode }) {
  return (
    <details className="cockpit-formula">
      <summary>Fórmula e fonte</summary>
      <div>{children}</div>
    </details>
  );
}
function Metric({
  name,
  value,
  detail,
  story,
  formula,
}: {
  name: string;
  value: string;
  detail: ReactNode;
  story: string;
  formula: string;
}) {
  return (
    <section className="cockpit-metric">
      <span>{name}</span>
      <strong>{value}</strong>
      <div className="cockpit-delta">{detail}</div>
      <p>{story}</p>
      <Formula>{formula}</Formula>
    </section>
  );
}
function Spark({
  values,
  label: description,
}: {
  values: (number | null)[];
  label: string;
}) {
  const valid = values.filter((v): v is number => v !== null);
  if (!valid.length) return <small>Sem série</small>;
  const min = Math.min(...valid),
    range = Math.max(...valid) - min || 1;
  const points = values.map((v, i) =>
    v === null
      ? null
      : [
          (i * 96) / Math.max(1, values.length - 1),
          28 - ((v - min) / range) * 24,
        ],
  );
  const path = points
    .map((p, i) =>
      p ? `${i === 0 || !points[i - 1] ? "M" : "L"}${p.join(",")}` : "",
    )
    .join(" ");
  return (
    <svg
      className="cockpit-spark"
      viewBox="-2 0 102 32"
      role="img"
      aria-label={description}
    >
      <title>
        {description}:{" "}
        {values.map((v) => (v === null ? "sem dado" : num(v))).join(" · ")}
      </title>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function Trend({
  months,
  series,
  percent = true,
  shade = false,
}: {
  months: string[];
  series: { name: string; values: (number | null)[]; color: string }[];
  percent?: boolean;
  shade?: boolean;
}) {
  const values = series.flatMap((s) =>
    s.values.filter((v): v is number => v !== null),
  );
  if (!values.length)
    return (
      <p className="cockpit-empty">Sem dados suficientes para esta série.</p>
    );
  const low = Math.min(0, ...values),
    high = Math.max(...values, 1),
    range = high - low || 1;
  const x = (i: number) => 54 + (i * 602) / Math.max(months.length - 1, 1),
    y = (v: number) => 182 - ((v - low) / range) * 154;
  const path = (v: (number | null)[]) =>
    v
      .map((n, i) =>
        n === null
          ? ""
          : `${i === 0 || v[i - 1] === null ? "M" : "L"}${x(i)},${y(n)}`,
      )
      .join(" ");
  return (
    <>
      <svg
        className="cockpit-trend"
        viewBox="0 0 710 215"
        role="img"
        aria-label={series.map((s) => s.name).join(" versus ")}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              x1="54"
              x2="656"
              y1={y(low + range * f)}
              y2={y(low + range * f)}
              stroke="var(--p-line)"
            />
            <text x="45" y={y(low + range * f) + 4} textAnchor="end">
              {num(low + range * f)}
              {percent ? "%" : ""}
            </text>
          </g>
        ))}
        {shade &&
          series.length >= 2 &&
          months.slice(1).map((m, i) => {
            const a = series[0]!.values,
              b = series[1]!.values;
            if ([a[i], a[i + 1], b[i], b[i + 1]].some((n) => n === null))
              return null;
            return (
              <polygon
                key={m}
                points={`${x(i)},${y(a[i]!)} ${x(i + 1)},${y(a[i + 1]!)} ${x(i + 1)},${y(b[i + 1]!)} ${x(i)},${y(b[i]!)}`}
                fill="var(--p-accent)"
                opacity=".12"
              />
            );
          })}
        {series.map((s, k) => (
          <g key={s.name}>
            <path
              d={path(s.values)}
              fill="none"
              stroke={s.color}
              strokeWidth="2.6"
              strokeDasharray={k === 2 ? "6 4" : undefined}
            />
            {s.values.map((v, i) =>
              v === null ? null : (
                <circle key={i} cx={x(i)} cy={y(v)} r="3" fill={s.color}>
                  <title>
                    {label(months[i])} · {s.name}: {percent ? pct(v) : num(v)}
                  </title>
                </circle>
              ),
            )}
          </g>
        ))}
        {[0, Math.floor((months.length - 1) / 2), months.length - 1].map(
          (i) => (
            <text key={i} x={x(i)} y="206" textAnchor="middle">
              {label(months[i])}
            </text>
          ),
        )}
      </svg>
      <div className="cockpit-legend">
        {series.map((s) => (
          <span key={s.name}>
            <i style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </>
  );
}
function Waterfall({
  data,
  onBar,
}: {
  data: NonNullable<Cockpit["waterfall"]>;
  onBar: (key: string) => void;
}) {
  const all = [
    {
      key: "start",
      label: "Anterior",
      value: data.start,
      from: 0,
      to: data.start,
    },
    ...data.bars.map((b, index) => {
      const from = data.start + data.bars.slice(0, index).reduce((sum, bar) => sum + bar.value, 0);
      return { ...b, from, to: from + b.value };
    }),
    { key: "end", label: "Atual", value: data.end, from: 0, to: data.end },
  ];
  const min = Math.min(0, ...all.flatMap((b) => [b.from, b.to])),
    max = Math.max(1, ...all.flatMap((b) => [b.from, b.to])),
    range = max - min;
  const y = (v: number) => 180 - ((v - min) / range) * 140;
  return (
    <>
      <svg
        viewBox="0 0 710 240"
        className="cockpit-trend"
        role="img"
        aria-label="Decomposição da variação do CMV em pontos percentuais"
      >
        <line x1="15" x2="700" y1={y(0)} y2={y(0)} stroke="var(--p-line)" />
        {all.map((b, i) => (
          <g key={b.key}>
            <rect
              x={20 + i * 98}
              y={y(Math.max(b.from, b.to))}
              width="66"
              height={Math.max(2, Math.abs(y(b.from) - y(b.to)))}
              fill={
                i === 0 || i === all.length - 1
                  ? "var(--p-accent)"
                  : b.value <= 0
                    ? "#648d78"
                    : "#b77d57"
              }
            >
              <title>
                {b.label}: {pp(b.value)}
              </title>
            </rect>
            <text
              x={53 + i * 98}
              y={y(Math.max(b.from, b.to)) - 7}
              textAnchor="middle"
            >
              {i === 0 || i === all.length - 1 ? pct(b.value) : pp(b.value)}
            </text>
            <text x={53 + i * 98} y="213" textAnchor="middle">
              {
                [
                  "Anterior",
                  "Mix",
                  "Inflação",
                  "Negociação",
                  "Venda",
                  "Resíduo",
                  "Atual",
                ][i]
              }
            </text>
          </g>
        ))}
      </svg>
      <div className="cockpit-bar-buttons">
        {data.bars.map((b) => (
          <button key={b.key} onClick={() => onBar(b.key)}>
            {b.label} <strong>{pp(b.value)}</strong>
          </button>
        ))}
      </div>
    </>
  );
}
export default function CockpitClient({
  units,
  initialMonth,
  completeMonths,
  initialUnit,
}: {
  units: { id: string; name: string }[];
  initialMonth: string;
  initialUnit: string | null;
  completeMonths: Record<string, string | null>;
}) {
  const { unitId: selectedHouse, setUnitId: selectHouse } = useAuth();
  const [filter, setFilter] = useState<CockpitFilter>({
      unitId: selectedHouse === "all" ? null : (selectedHouse ?? initialUnit),
      month: initialMonth,
      comparison: "previous",
    }),
    [draft, setDraft] = useState(filter);
  const [data, setData] = useState<Awaited<
      ReturnType<typeof getCockpit>
    > | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false);
  const [bar, setBar] = useState<string | null>(null),
    [menuGroup, setMenuGroup] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const [previousHouse, setPreviousHouse] = useState(selectedHouse);
  if (previousHouse !== selectedHouse) {
    setPreviousHouse(selectedHouse);
    const unitId = resolveUnitScope(selectedHouse, units.map((u) => u.id));
    setFilter((current) => current.unitId === unitId ? current : { ...current, unitId });
    setDraft((current) => current.unitId === unitId ? current : { ...current, unitId });
    if (filter.unitId !== unitId) setData(null);
  }
  const [previousRequest, setPreviousRequest] = useState({ filter, revision });
  if (previousRequest.filter !== filter || previousRequest.revision !== revision) {
    setPreviousRequest({ filter, revision });
    setLoading(true);
    setError("");
  }
  useEffect(() => {
    let active = true;
    getCockpit(filter)
      .then((d) => {
        if (active) {
          setData(d);
          setMenuGroup("");
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "Não foi possível carregar o cockpit.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filter, revision]);
  useEffect(() => {
    if (bar) dialog.current?.showModal();
    else dialog.current?.close();
  }, [bar]);
  const house = (id: string | undefined) =>
    units.find((u) => u.id === id)?.name ?? "Casa";
  const detailHref = (section: string | undefined) =>
    `/compras/prisma/${section}?month=${filter.month}${filter.unitId ? `&unit=${filter.unitId}` : ""}`;
  async function action(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    try {
      await fn();
      setNotice(message);
      setRevision((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }
  const delta =
    data?.current.real != null &&
    data.previous.real != null &&
    !data.current.incomplete &&
    !data.previous.incomplete &&
    !data.current.unverified &&
    !data.previous.unverified
      ? data.current.real - data.previous.real
      : null;
  const strongest = data?.waterfall?.bars
    .filter((b) => b.key !== "negotiation")
    .slice()
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
  const groups = data
    ? [...new Set(data.menu.map((d) => `${d.unit_id}|${d.grupo}`))]
    : [];
  const chosenGroup = menuGroup || groups[0];
  const dots =
    data?.menu.filter(
      (d) =>
        `${d.unit_id}|${d.grupo}` === chosenGroup &&
        d.margin !== null &&
        d.popularity !== null,
    ) ?? [];
  const colors: Record<string, string> = {
    Estrela: "#84b397",
    "Burro de carga": "#d5a267",
    "Quebra-cabeça": "#91a9ca",
    Cão: "#bd7d78",
  };
  const maxX = Math.max(0.01, ...dots.map((d) => d.popularity!)),
    minY = Math.min(0, ...dots.map((d) => d.margin!)),
    maxY = Math.max(1, ...dots.map((d) => d.margin!));
  const sx = (n: number) => 50 + (n / maxX) * 580,
    sy = (n: number) => 200 - ((n - minY) / (maxY - minY)) * 170;
  return (
    <article className="prisma cockpit">
      <nav className="cockpit-nav" aria-label="Detalhes do Prisma">
        <Link href="/compras">Compras</Link>
        <span>/ Prisma</span>
        <Link href="/compras/abastecimento">Rotina de abastecimento ↗</Link>
        <Link href="/compras/prisma/mapa">Mapa de dependências ↗</Link>
        <Link href="/compras/fichas">Revisar fichas ↗</Link>
        <div>
          {[
            ["categorias", "Categorias"],
            ["fornecedores", "Fornecedores"],
            ["ancoras", "Âncoras"],
            ["plano", "Plano de ação"],
            ["estrategia", "Estratégia"],
          ].map(([s, l]) => (
            <a key={s} href={detailHref(s)}>
              {l} ↗
            </a>
          ))}
        </div>
      </nav>
      <header>
        <p className="prisma-eyebrow">GRUPO KPH · COCKPIT DE MARGEM</p>
        <h1>
          Prisma de Compras<span>.</span>
        </h1>
        <p>O que mudou na margem. De onde veio. O que fazer agora.</p>
      </header>
      <form
        className="prisma-filters cockpit-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setData(null);
          setFilter({ ...draft });
          selectHouse(draft.unitId ?? "all");
          setNotice("");
        }}
      >
        <label>
          Casa
          <select
            value={draft.unitId ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                unitId: e.target.value || null,
                month: completeMonths[e.target.value || "all"] ?? draft.month,
              })
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
          Mês de referência
          <input
            required
            type="month"
            value={draft.month.slice(0, 7)}
            onChange={(e) =>
              setDraft({ ...draft, month: `${e.target.value}-01` })
            }
          />
        </label>
        <label>
          Comparar com
          <select
            value={draft.comparison}
            onChange={(e) =>
              setDraft({
                ...draft,
                comparison: e.target.value as CockpitFilter["comparison"],
              })
            }
          >
            <option value="previous">Mês anterior</option>
            <option value="year">Mesmo mês do ano anterior</option>
          </select>
        </label>
        <button className="prisma-primary" disabled={loading}>
          Aplicar
        </button>
      </form>
      {error && (
        <div role="alert" className="prisma-alert">
          {error}{" "}
          <button onClick={() => window.location.reload()}>Recarregar</button>
        </div>
      )}
      {data?.warnings.map((warning) => (
        <p className="prisma-alert" role="status" key={warning}>
          {warning}
        </p>
      ))}
      {notice && (
        <div role="status" className="prisma-notice">
          {notice} <a href={detailHref("plano")}>Ver plano →</a>
        </div>
      )}
      {loading ? (
        <div role="status" className="prisma-loading">
          Conciliando compras, vendas e fichas do período…
        </div>
      ) : (
        data && (
          <>
            <p className="cockpit-period">
              {label(data.month)} versus {label(data.compare)} · tendência de 12
              meses · valores sem gorjeta
            </p>
            {(data.current.incomplete ||
              data.current.partialRevenue ||
              data.current.unverified) && (
              <div className="prisma-alert" role="status">
                <strong>
                  {data.current.incomplete ? "Notas incompletas. " : ""}
                  {data.current.partialRevenue ? "Receita parcial. " : ""}
                  {data.current.unverified
                    ? "Histórico insuficiente para validar todas as casas. "
                    : ""}
                </strong>
                Compras, custos, inflação e comparações são provisórios. A queda
                do CMV não comprova economia.
              </div>
            )}
            <div className="cockpit-metrics">
              <Metric
                name="CMV real"
                value={
                  data.current.partialRevenue
                    ? "Receita parcial"
                    : pct(data.current.real)
                }
                detail={
                  <>
                    {pp(delta)} ·{" "}
                    {data.current.method === "inventario"
                      ? "por inventário"
                      : data.current.method === "misto"
                        ? "base mista"
                        : "proxy por compras"}
                    <small>Meta: {pct(data.current.target)}</small>
                  </>
                }
                story={
                  data.current.incomplete
                    ? "Notas incompletas: aguardar conciliação antes de interpretar melhora de margem."
                    : data.current.partialRevenue
                      ? "Receita parcial: o percentual está suspenso até validar a base."
                      : data.current.unverified
                        ? "Histórico insuficiente: a comparação ainda precisa de validação."
                        : delta === null
                          ? "Receita ou comparação insuficiente para medir a variação."
                          : `CMV ${delta > 0 ? "subiu" : delta < 0 ? "caiu" : "ficou estável"} ${num(Math.abs(delta))} p.p..${strongest ? ` Maior componente: ${strongest.label.toLowerCase()}.` : " Sem fichas comparáveis para atribuir a causa."}`
                }
                formula="Everest: estoque inicial + compras CMV − estoque final, se ambos os inventários forem completos, encerrados, dos mesmos depósitos e com custo válido. Sem isso: compras CMV ÷ receita total dos produtos Lorean. A aproximação não mede consumo real."
              />
              <Metric
                name="Gap real × teórico"
                value={pp(data.current.gap)}
                detail={
                  <>
                    {money(data.current.gapRs)}
                    <small>
                      Cobertura com custo:{" "}
                      {pct(
                        data.current.coverage === null
                          ? null
                          : data.current.coverage * 100,
                      )}
                    </small>
                  </>
                }
                story={`${data.current.gap !== null && data.previous.gap !== null ? `Variação do gap: ${pp(data.current.gap - data.previous.gap)}. ` : ""}Ponte confirmada: ${pct(data.current.bridgeCoverage === null ? null : data.current.bridgeCoverage * 100)} da receita. O gap inclui estoque, cobertura, fichas e eficiência; não é perda comprovada.`}
                formula="Gap = CMV real − (quantidade vendida × custo unitário de fichas confirmadas ÷ receita dos pratos com custo completo no mês). Gap R$ = gap percentual × receita total, uma extrapolação da cesta coberta. Custos somente do Everest."
              />
              <Metric
                name="Inflação de compra · prévia 12m"
                value={
                  data.priceIndex.suspicious.length
                    ? "Validar unidades"
                    : pct(data.priceIndex.inflation)
                }
                detail={
                  <>
                    Base 100 · {data.priceIndex.items}/
                    {data.priceIndex.selected} itens
                    <small>
                      Histórico da cesta: {data.priceIndex.historyMonths}/12
                      meses
                    </small>
                    <small>
                      Preço observado no mês:{" "}
                      {pct(
                        (data.priceIndex.points.at(-1)?.observed ?? 0) * 100,
                      )}
                    </small>
                  </>
                }
                story={
                  data.priceIndex.suspicious.length
                    ? `${data.priceIndex.suspicious.length} insumos variaram mais de 2,5×. Índice bruto: ${pct(data.priceIndex.inflation)}; conferir unidade e embalagem antes de interpretar como inflação.`
                    : data.priceIndex.inflation === null
                      ? "Sem cesta histórica suficiente para medir a inflação."
                      : `A cesta fixa ${data.priceIndex.inflation >= 0 ? "encareceu" : "barateou"} ${pct(Math.abs(data.priceIndex.inflation))} desde ${label(data.months[0])}.`
                }
                formula="Laspeyres: Σ quantidade fixa × preço do mês ÷ Σ quantidade fixa × preço base. Cesta fixa para a série: até 80 itens de maior gasto nos 12 meses anteriores ao mês de referência. Base 100 no primeiro mês da série; itens sem preço base ficam fora, com cobertura explícita. Sem compra no mês, carrega último preço observado por até 12 meses. Não mede causalmente o resultado das negociações."
              />
              <Metric
                name="Economia capturada · ano"
                value={money(data.capturedYear)}
                detail={
                  <>
                    Meta: {money(data.savingsTarget)}
                    <small>No mês: {money(data.capturedMonth)}</small>
                  </>
                }
                story={
                  data.capturedYear > 0
                    ? "Soma das capturas registradas no plano, pela data efetiva informada."
                    : "Ainda não há economia registrada como capturada neste ano."
                }
                formula="compras_plano_acao: soma de capturado_rs com status capturada e capturado_em entre janeiro e o fim do mês selecionado. Não usa teto de negociação. Meta anual até o mês = soma das metas mensais cadastradas; sem cobertura completa a meta fica indisponível."
              />
            </div>
            {(data.current.missingRevenue > 0 ||
              !data.refresh ||
              data.undatedCaptures > 0) && (
              <p className="prisma-alert">
                {data.current.missingRevenue > 0 &&
                  `${data.current.missingRevenue} casa(s) têm compras sem receita no mês. `}
                {!data.refresh &&
                  "A atualização do cockpit precisa ser conferida. "}
                {data.undatedCaptures > 0 &&
                  `${data.undatedCaptures} captura(s) sem data não entraram na economia do período.`}
              </p>
            )}
            <section className="cockpit-section">
              <p className="prisma-eyebrow">01 / MARGEM</p>
              <h2>Estamos ganhando ou perdendo margem?</h2>
              <p>
                CMV, teórico e meta, casa a casa. A área entre as linhas é uma
                diferença a investigar.
              </p>
              <div className="cockpit-house-grid">
                {data.byUnit.map((u) => (
                  <section className="cockpit-panel" key={u.id}>
                    <h3>{u.name}</h3>
                    <p>
                      {pct(u.months.at(-1)?.real ?? null)} ·{" "}
                      {u.months.at(-1)?.method === "inventario"
                        ? "por inventário"
                        : "proxy por compras"}{" "}
                      · cobertura teórica{" "}
                      {pct((u.months.at(-1)?.coverage ?? 0) * 100)}
                    </p>
                    <Trend
                      months={data.months}
                      shade
                      series={[
                        {
                          name: "Real / proxy",
                          values: u.months.map((m) => m.real),
                          color: "var(--p-accent)",
                        },
                        {
                          name: "Teórico · prévia",
                          values: u.months.map((m) => m.theory),
                          color: "#d5a267",
                        },
                        {
                          name: "Meta",
                          values: u.months.map((m) => m.target),
                          color: "#879aab",
                        },
                      ]}
                    />
                    <details>
                      <summary>Conferir os 12 meses</summary>
                      <div className="prisma-table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Mês</th>
                              <th>Real / proxy</th>
                              <th>Teórico</th>
                              <th>Cobertura</th>
                              <th>Meta</th>
                              <th>Método</th>
                            </tr>
                          </thead>
                          <tbody>
                            {u.months.map((m) => (
                              <tr key={m.month}>
                                <th>
                                  {label(m.month)}
                                  <small>
                                    {m.incomplete ? " · notas incompletas" : ""}
                                    {m.partialRevenue
                                      ? " · receita parcial"
                                      : ""}
                                    {m.unverified ? " · a validar" : ""}
                                  </small>
                                </th>
                                <td>{pct(m.real)}</td>
                                <td>{pct(m.theory)}</td>
                                <td>
                                  {pct(
                                    m.coverage === null
                                      ? null
                                      : m.coverage * 100,
                                  )}
                                </td>
                                <td>{pct(m.target)}</td>
                                <td>
                                  {m.method === "inventario"
                                    ? "Inventário"
                                    : "Proxy"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </section>
                ))}
              </div>
              <details className="cockpit-panel">
                <summary>Inventário: valores e itens sem custo</summary>
                <p>
                  Valoramos pela casa e mês da contagem. Sem referência de valor
                  para um item, a cobertura financeira fica desconhecida e o mês
                  permanece proxy.
                </p>
                <div className="prisma-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Casa / data</th>
                        <th>Estoque valorado</th>
                        <th>Itens positivos sem custo</th>
                        <th>Valor coberto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.stockClosings.map((r) => (
                        <tr key={`${r.unit_id}|${r.dia}`}>
                          <th>
                            {house(r.unit_id)} · {r.dia}
                          </th>
                          <td>{money(Number(r.estoque_rs))}</td>
                          <td>
                            {r.itens_sem_custo}/{r.itens_positivos}
                          </td>
                          <td>
                            {r.pct_valorado == null
                              ? "Desconhecido"
                              : pct(Number(r.pct_valorado) * 100)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul>
                  {data.stockMissing.map((r, i) => (
                    <li key={i}>
                      {house(r.unit_id)} · {r.dia} · {r.deposito}:{" "}
                      {r.descricao_item} — {num(Number(r.quantidade))}{" "}
                      {r.unidade_medida} · sem custo
                    </li>
                  ))}
                </ul>
                {data.stockMissing.length === 500 && (
                  <p>Exibindo os primeiros 500 itens sem custo.</p>
                )}
              </details>
              {data.canEdit && (
                <details className="cockpit-panel">
                  <summary>Editar meta de uma casa</summary>
                  <form
                    className="prisma-filters"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void action(
                        () =>
                          saveCockpitTarget({
                            unitId: String(f.get("unit")),
                            month: filter.month,
                            cmv: f.get("cmv") ? Number(f.get("cmv")) : null,
                            savings: f.get("savings")
                              ? Number(f.get("savings"))
                              : null,
                          }),
                        "Meta salva para o mês selecionado.",
                      );
                    }}
                  >
                    <label>
                      Casa
                      <select
                        name="unit"
                        defaultValue={filter.unitId ?? units[0]?.id}
                      >
                        {units.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Meta CMV (%)
                      <input
                        name="cmv"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                      />
                    </label>
                    <label>
                      Meta de economia (R$)
                      <input name="savings" type="number" min="0" step="0.01" />
                    </label>
                    <button disabled={busy}>
                      Salvar meta · {label(filter.month)}
                    </button>
                  </form>
                  <small>
                    Em branco: remove a meta própria. Para CMV, volta à meta
                    operacional do mesmo mês, quando cadastrada.
                  </small>
                </details>
              )}
            </section>
            <section className="cockpit-section">
              <p className="prisma-eyebrow">02 / VARIAÇÃO</p>
              <h2>De onde veio a mudança?</h2>
              {data.waterfall ? (
                <>
                  <p>
                    Cesta comparável: {data.waterfall.count} pratos ·{" "}
                    {pct((data.waterfall.coverage ?? 0) * 100)} da receita
                    atual. Selecione um componente para investigar.
                  </p>
                  <Waterfall data={data.waterfall} onBar={setBar} />
                  <p className="cockpit-proof">
                    Fechamento da cascata: diferença{" "}
                    {pp(data.waterfall.closure)}.
                  </p>
                </>
              ) : (
                <div className="cockpit-empty">
                  Não há receita e fichas com custo nos dois períodos para
                  atribuir a variação.{" "}
                  <Link href="/compras/fichas">Revisar a ponte →</Link>
                </div>
              )}
              <Formula>
                T(q,c,s) = Σq·c / Σq·s, em pontos percentuais. Sequência: muda
                quantidade (mix), custo (compra) e preço de venda. Usa a mesma
                cesta de pratos com ficha e custo nos dois períodos. O resíduo é
                Δ(real − T) desta cesta; inclui cobertura e proxy. Negociação
                registrada = −captura do mês ÷ receita. Inflação/outros preços =
                efeito líquido de compra menos essa anotação; sem causalidade
                comprovada por item.
              </Formula>
              <div className="cockpit-house-grid">
                <section className="cockpit-panel">
                  <h3>O preço que veio · índice bruto</h3>
                  {data.priceIndex.suspicious.length > 0 && (
                    <details className="cockpit-formula">
                      <summary>
                        Conferir {data.priceIndex.suspicious.length} insumos com
                        variação acima de 2,5×
                      </summary>
                      <ul>
                        {data.priceIndex.suspicious.map((item) => (
                          <li key={item.item}>
                            {item.name}: {money(item.min)} a {money(item.max)} ·{" "}
                            {num(item.ratio)}×. Conferir unidade da nota.
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <Trend
                    months={data.months}
                    percent={false}
                    series={[
                      {
                        name: "Laspeyres · base 100",
                        values: data.priceIndex.points.map((p) => p.value),
                        color: "#d5a267",
                      },
                    ]}
                  />
                  <p>
                    Cesta precificada:{" "}
                    {pct(
                      data.priceIndex.baseCoverage === null
                        ? null
                        : data.priceIndex.baseCoverage * 100,
                    )}{" "}
                    do gasto dos itens selecionados. Preços sem compra recente
                    são carregados e sinalizados no cartão.
                  </p>
                </section>
                <section className="cockpit-panel">
                  <h3>O que foi capturado</h3>
                  <Trend
                    months={data.months}
                    percent={false}
                    series={[
                      {
                        name: "Economia acumulada · R$",
                        values: data.capturedTrend,
                        color: "var(--p-accent)",
                      },
                    ]}
                  />
                  <p>
                    Registro do plano. Não é uma estimativa de quanto a inflação
                    teria sido sem negociação.
                  </p>
                </section>
              </div>
            </section>
            <section className="cockpit-section">
              <p className="prisma-eyebrow">03 / CARDÁPIO</p>
              <h2>O que vende e o que sobra?</h2>
              <p>
                Os 10 pratos de maior receita. Margem de contribuição após custo
                dos ingredientes; não desconta outros custos variáveis.
              </p>
              <div className="prisma-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Prato / casa</th>
                      <th>Receita</th>
                      <th>Qtd</th>
                      <th>Preço médio</th>
                      <th>Custo unit.</th>
                      <th>Margem unit. / total</th>
                      <th>CMV / Δ</th>
                      <th>12 meses</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.menu.slice(0, 10).map((d) => (
                      <tr key={`${d.unit_id}|${d.nome_venda}`}>
                        <th>
                          {d.name}
                          <small>
                            {house(d.unit_id)} · {d.grupo}
                          </small>
                          {d.papel && (
                            <small>
                              {d.papel}
                              {d.conflict
                                ? " · conflito de marca e margem: decisão conjunta"
                                : ""}
                            </small>
                          )}
                          {d.kind ? (
                            <span className="prisma-tag">{d.kind}</span>
                          ) : (
                            <a
                              href={
                                d.status_ponte === "confirmado" &&
                                d.custo_unitario !== null
                                  ? "/compras/abastecimento"
                                  : "/compras/fichas"
                              }
                            >
                              {d.status_ponte !== "confirmado"
                                ? "A validar · sem ficha"
                                : d.custo_unitario === null
                                  ? "A validar · custo incompleto"
                                  : "A validar · disponibilidade desconhecida"}{" "}
                              ↗
                            </a>
                          )}
                        </th>
                        <td>{money(d.receita)}</td>
                        <td>{num(d.qtd)}</td>
                        <td>{money(d.price)}</td>
                        <td>{money(d.custo_unitario)}</td>
                        <td>
                          {money(d.margin)}
                          <small>{money(d.marginTotal)}</small>
                        </td>
                        <td>
                          {pct(d.cmv)}
                          <small>{pp(d.deltaCmv)}</small>
                        </td>
                        <td>
                          <Spark
                            values={d.trend}
                            label={`Receita mensal de ${d.name}`}
                          />
                        </td>
                        <td>
                          <button
                            disabled={busy}
                            onClick={() =>
                              void action(
                                () =>
                                  addMenuPlan({
                                    unitId: d.unit_id,
                                    month: filter.month,
                                    name: d.nome_venda,
                                  }),
                                "Prato levado ao plano.",
                              )
                            }
                          >
                            Levar ao plano
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Formula>
                Fonte: produtos Lorean (total e qtd), ponte confirmada e ficha
                explodida Everest × preço médio de compra do mês. Receita ÷ qtd
                = preço de venda. Margem unitária = preço − custo; total = qtd ×
                margem. Sem custo de todos os insumos, não há margem nem
                classificação. Cobertura geral:{" "}
                {pct((data.current.coverage ?? 0) * 100)}. Δ CMV contra o
                período selecionado; nomes vendidos continuam separados por
                casa.
              </Formula>
              <div className="cockpit-panel">
                <h3>Engenharia de cardápio</h3>
                <label>
                  Grupo / casa
                  <select
                    value={chosenGroup ?? ""}
                    onChange={(e) => setMenuGroup(e.target.value)}
                  >
                    {groups.map((g) => (
                      <option key={g} value={g}>
                        {house(g.split("|")[0])} ·{" "}
                        {g.split("|").slice(1).join("|")}
                      </option>
                    ))}
                  </select>
                </label>
                {dots.length ? (
                  <>
                    <svg
                      className="cockpit-trend"
                      viewBox="0 0 710 250"
                      role="img"
                      aria-label="Popularidade versus margem de contribuição"
                    >
                      <line
                        x1="50"
                        x2="630"
                        y1={sy(dots[0]!.averageMargin!)}
                        y2={sy(dots[0]!.averageMargin!)}
                        stroke="var(--p-muted)"
                        strokeDasharray="4 4"
                      />
                      <line
                        x1={sx(dots[0]!.cutoff)}
                        x2={sx(dots[0]!.cutoff)}
                        y1="30"
                        y2="200"
                        stroke="var(--p-muted)"
                        strokeDasharray="4 4"
                      />
                      {dots.map((d) => (
                        <circle
                          key={d.nome_venda}
                          cx={sx(d.popularity!)}
                          cy={sy(d.margin!)}
                          r="6"
                          fill={colors[d.kind!]}
                        >
                          <title>
                            {d.name} · {d.kind} · participação{" "}
                            {pct(d.popularity! * 100)} · margem{" "}
                            {money(d.margin)}
                          </title>
                        </circle>
                      ))}
                      <text x="340" y="238" textAnchor="middle">
                        Participação nas vendas por dia disponível →
                      </text>
                      <text x="15" y="25">
                        Margem R$ ↑
                      </text>
                    </svg>
                    <div className="cockpit-legend">
                      {Object.entries(colors).map(([name, color]) => (
                        <span key={name}>
                          <i style={{ background: color }} />
                          {name}
                        </span>
                      ))}
                    </div>
                    <p>
                      Margem calculável em{" "}
                      {pct((dots[0]!.groupCoverage ?? 0) * 100)} da receita do
                      grupo. Média e classificação são parciais abaixo de 100%.
                    </p>
                  </>
                ) : (
                  <p>
                    Custo ou dias de disponibilidade ainda precisam ser
                    validados neste grupo.
                  </p>
                )}
                <Formula>
                  Popularidade pela participação das vendas por dia disponível,
                  excluindo dias bloqueados. Dias desconhecidos impedem a
                  classificação. Kasavana-Smith: popularidade alta ≥ 70% × (1 /
                  número de pratos do grupo). Margem alta ≥ média unitária
                  ponderada pela quantidade dos pratos com custo. Estrela:
                  manter e destacar. Burro de carga: rever preço/ficha.
                  Quebra-cabeça: reposicionar. Cão: revisar permanência. A
                  classificação não substitui a decisão operacional.
                </Formula>
              </div>
            </section>
            <section className="cockpit-section">
              <p className="prisma-eyebrow">04 / DEPENDÊNCIA</p>
              <h2>De quem dependemos?</h2>
              <p>
                Top 10 por gasto do mês. Nota, inflação e Kraljic consideram a
                janela de 12 meses.
              </p>
              <div className="prisma-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Fornecedor</th>
                      <th>Gasto / fatia</th>
                      <th>Inflação 12m</th>
                      <th>Nota / quadrante</th>
                      <th>Receita dependente · prévia</th>
                      <th>12 meses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.suppliers.map((s) => (
                      <tr key={s.root}>
                        <th>
                          <a
                            href={`${detailHref("fornecedores")}&root=${encodeURIComponent(s.root)}`}
                          >
                            {s.name} ↗
                          </a>
                        </th>
                        <td>
                          {money(s.spend)}
                          <small>{pct(s.share * 100)}</small>
                        </td>
                        <td>
                          {pct(
                            s.info?.inflation === null ||
                              s.info?.inflation === undefined
                              ? null
                              : s.info.inflation * 100,
                          )}
                        </td>
                        <td>
                          {s.info?.score ?? "—"}
                          <small>
                            {s.info?.quadrant ?? "Sem classificação"}
                          </small>
                        </td>
                        <td>
                          {money(s.dependent)}
                          <small>
                            Cobertura da ponte{" "}
                            {pct((data.current.bridgeCoverage ?? 0) * 100)}
                          </small>
                        </td>
                        <td>
                          <Spark
                            values={s.trend}
                            label={`Gasto mensal com ${s.name}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Formula>
                Gasto: itens com CFOP de CMV, raiz de CNPJ unificada. Inflação:
                mesmos itens/fornecedores, 90 dias finais contra iniciais da
                janela de 12 meses. Nota e risco seguem o Prisma de
                fornecedores. Receita dependente: mv_fornecedor_ancora, prévia
                que usa a ponte confirmada e o modelo de custo das âncoras; não
                equivale à receita garantida.
              </Formula>
              <h3>Mix por categoria</h3>
              <div className="cockpit-category-grid">
                {data.categories.map((c) => (
                  <section key={c.name} className="cockpit-panel">
                    <h3>{c.name}</h3>
                    <p>
                      {c.suppliers} fornecedores · {c.pareto} fazem 80% · HHI{" "}
                      {c.hhi === null ? "—" : num(c.hhi)}
                    </p>
                    <div
                      className="cockpit-stack"
                      aria-label={`Concentração em ${c.name}`}
                    >
                      {c.roots.slice(0, 3).map((s, i) => (
                        <span
                          key={s.root}
                          style={{
                            width: `${s.share * 100}%`,
                            background: ["#628e75", "#8da891", "#bac7ae"][i],
                          }}
                          title={`${data.suppliers.find((x) => x.root === s.root)?.name ?? s.root}: ${pct(s.share * 100)}`}
                        />
                      ))}
                      <span
                        style={{ flex: 1, background: "var(--p-line)" }}
                        title="Outros"
                      />
                    </div>
                    <small>
                      Top 3 + outros · quantidade de fornecedores para 80%, mês
                      a mês:
                    </small>
                    <Spark
                      values={c.trend}
                      label={`Fornecedores que fazem 80% em ${c.name}`}
                    />
                  </section>
                ))}
              </div>
              <Formula>
                HHI = Σ(participação do fornecedor no gasto da categoria)² ×
                10.000. Pareto inclui o fornecedor que cruza 80%. Meses sem
                compra aparecem com zero fornecedores. Valores líquidos
                positivos por fornecedor; devoluções não criam participações
                negativas.
              </Formula>
            </section>
            <section className="cockpit-section">
              <p className="prisma-eyebrow">05 / EXECUÇÃO</p>
              <h2>O que fazer agora?</h2>
              <ol className="cockpit-actions">
                {data.decisions.map((s) => (
                  <li key={s.root}>
                    <div>
                      <strong>
                        {supplierAction(s)}: {s.name}
                      </strong>
                      <p>
                        Teto comparável: {money(s.overpaid)}. Validar embalagem
                        e qualidade.
                      </p>
                    </div>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action(
                          () =>
                            addPrismaPlan({
                              filter: {
                                unitId: filter.unitId,
                                start: shiftMonth(filter.month, -11),
                                end: monthEnd(filter.month),
                              },
                              root: s.root,
                            }),
                          "Negociação levada ao plano.",
                        )
                      }
                    >
                      Levar ao plano
                    </button>
                  </li>
                ))}
                {data.menu
                  .filter(
                    (d) => d.kind === "Burro de carga" || d.kind === "Cão",
                  )
                  .slice(0, 5)
                  .map((d) => (
                    <li key={`${d.unit_id}|${d.nome_venda}`}>
                      <div>
                        <strong>
                          {d.name} · {d.kind}
                        </strong>
                        <p>
                          {house(d.unit_id)} · revisar ficha, preço e
                          posicionamento.
                        </p>
                      </div>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void action(
                            () =>
                              addMenuPlan({
                                unitId: d.unit_id,
                                month: filter.month,
                                name: d.nome_venda,
                              }),
                            "Prato levado ao plano.",
                          )
                        }
                      >
                        Levar ao plano
                      </button>
                    </li>
                  ))}
              </ol>
              <h3>Alertas da semana</h3>
              <p>
                Notas e preços: últimos 7 dias. Consumo e pratos sem ficha: mês
                em curso, independente do filtro histórico.
              </p>
              <div className="cockpit-alerts">
                {data.alerts.slice(0, 20).map((a) => (
                  <article
                    className="cockpit-panel"
                    key={`${a.unit_id}|${a.tipo}|${a.alvo}`}
                  >
                    <small>
                      {house(a.unit_id)} · {a.tipo.replaceAll("_", " ")} ·{" "}
                      {a.data}
                    </small>
                    <h3>{a.titulo}</h3>
                    <p>{a.detalhe}</p>
                    {a.tipo === "abastecimento" && (
                      <Link href="/compras/abastecimento">
                        Conferir causa e registro de 86 na fila →
                      </Link>
                    )}
                    {a.tipo === "consumo_maior_compra" ? (
                      <p>
                        Consumo teórico {num(a.valor)} × compra{" "}
                        {num(a.referencia ?? 0)} na unidade do insumo.
                        {a.outra_unit_id &&
                          ` Há compra do mesmo insumo em ${house(a.outra_unit_id)}: conferir transferência.`}
                      </p>
                    ) : (
                      <p>
                        {money(a.valor)}
                        {a.referencia !== null &&
                          ` · referência ${money(a.referencia)}`}
                      </p>
                    )}
                  </article>
                ))}
                {!data.alerts.length && (
                  <p>Sem alertas nas regras e fontes disponíveis.</p>
                )}
              </div>
              <h3>Economia capturada por responsável</h3>
              {data.savingsByOwner.length ? (
                <ul>
                  {data.savingsByOwner.map((o) => (
                    <li key={o.name}>
                      {o.name}: <strong>{money(o.captured)}</strong>
                      {" · meta cadastrada "}
                      {money(o.target)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Nenhuma captura com data registrada neste ano.</p>
              )}
              <p>
                Meta das casas até o mês: {money(data.savingsTarget)}. Metas por
                responsável somam os meses cadastrados no ano; nomes devem
                coincidir com o plano.
              </p>
              {data.canEdit && (
                <details className="cockpit-formula">
                  <summary>Editar meta de responsável</summary>
                  <form
                    className="cockpit-filters"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void action(
                        () =>
                          saveOwnerTarget({
                            unitId: String(f.get("unit")),
                            month: filter.month,
                            owner: String(f.get("owner")),
                            savings: Number(f.get("savings")),
                          }),
                        "Meta do responsável salva.",
                      );
                    }}
                  >
                    <label>
                      Casa
                      <select
                        name="unit"
                        defaultValue={filter.unitId ?? units[0]?.id}
                        required
                      >
                        {units
                          .filter(
                            (u) => !filter.unitId || u.id === filter.unitId,
                          )
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Responsável
                      <input
                        name="owner"
                        required
                        maxLength={120}
                        placeholder="Nome igual ao plano"
                      />
                    </label>
                    <label>
                      Meta em {label(filter.month)} (R$)
                      <input
                        name="savings"
                        type="number"
                        min="0"
                        step="0.01"
                        required
                      />
                    </label>
                    <button disabled={busy}>Salvar meta</button>
                  </form>
                </details>
              )}
            </section>
            <footer className="prisma-method">
              <p>
                Fonte: Everest + quantidade e receita do Lorean. Última
                atualização do modelo:{" "}
                {data.refresh
                  ? new Date(data.refresh).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                    })
                  : "não confirmada"}
                . O mês corrente é parcial. Metas ausentes não são estimadas.
              </p>
            </footer>
            <dialog
              className="prisma-drawer"
              ref={dialog}
              onClose={() => setBar(null)}
              aria-labelledby="cockpit-bar-title"
            >
              <button aria-label="Fechar análise" onClick={() => setBar(null)}>
                Fechar ×
              </button>
              <h2 id="cockpit-bar-title">
                {data.waterfall?.bars.find((b) => b.key === bar)?.label}
              </h2>
              {bar === "negotiation" ? (
                <p>
                  {money(data.capturedMonth)} registrados no plano neste mês.
                  Não há vínculo obrigatório entre captura e prato; não
                  atribuímos esse valor a itens sem evidência.
                </p>
              ) : bar === "residual" ? (
                <p>
                  O resíduo fecha a diferença entre o CMV real/proxy e o teórico
                  da cesta comum. Inventários, transferências, cobertura e
                  fichas incompletas impedem atribuí-lo a dez pratos como se
                  fosse perda medida.
                </p>
              ) : (
                <ol>
                  {data.waterfall?.details
                    .slice()
                    .sort(
                      (a, b) =>
                        Math.abs(b[bar as "mix" | "price" | "sale"]) -
                        Math.abs(a[bar as "mix" | "price" | "sale"]),
                    )
                    .slice(0, 10)
                    .map((d, i) => (
                      <li key={i}>
                        {d.name} · {house(d.unitId)}{" "}
                        <strong>
                          {pp(d[bar as "mix" | "price" | "sale"])}
                        </strong>
                      </li>
                    ))}
                </ol>
              )}
              <small>
                Contribuições brutas do efeito de preço; captura registrada é
                uma anotação separada.
              </small>
            </dialog>
          </>
        )
      )}
    </article>
  );
}
