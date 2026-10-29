"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Layers3,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
  Utensils,
  X,
} from "lucide-react";
import { useAuth } from "@kph/auth/context";
import {
  getProtocolo86Data,
  saveTeto,
  toggleAssinatura,
  type Protocolo86Data,
} from "./protocolo-86-actions";
import {
  CLASSES,
  CLASSE_LABEL,
  CLASSE_DESCRIPTION,
  classRank,
  limitState,
  normalizeSearch,
  openSummary,
  rowKey,
  type Classe86,
} from "./protocolo-86-model";
import s from "./protocolo-86.module.css";

type View = "pratos" | "categorias" | "insumos";
type House = { id: string; name: string };
const PAGE_SIZE = 20;
const money = (n: number | null) =>
  n == null
    ? "—"
    : n.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
      });
function Badge({ value }: { value: string }) {
  return (
    <span className={s.badge} data-class={value}>
      {CLASSE_LABEL[value as Classe86] ?? value}
    </span>
  );
}

export default function Protocolo86Client() {
  const { unitId, units, setUnitId } = useAuth();
  const unit = unitId === "all" ? null : (unitId ?? null);
  return (
    <div className={s.page}>
      <header className={s.header}>
        <div>
          <p className={s.eyebrow}>
            <ShieldCheck size={15} aria-hidden="true" /> GHOST · CONTINUIDADE DO
            CARDÁPIO
          </p>
          <h1>
            Protocolo <em>86.</em>
          </h1>
          <p className={s.intro}>
            Proteja o que não pode faltar.
            <br />
            Priorize os pratos, alinhe os limites e cuide dos insumos.
          </p>
        </div>
        <div className={s.context}>
          <label className={s.field}>
            Casa acompanhada
            <select
              value={unit ?? "all"}
              onChange={(e) => setUnitId(e.target.value)}
            >
              <option value="all">Todas as casas</option>
              {units.map((house) => (
                <option key={house.id} value={house.id}>
                  {house.name}
                </option>
              ))}
            </select>
          </label>
          <Link className={s.primary} href="/compras/abastecimento">
            Abrir fila de abastecimento{" "}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </header>
      <Workspace key={unit ?? "all"} unit={unit} units={units} />
    </div>
  );
}

function Workspace({ unit, units }: { unit: string | null; units: House[] }) {
  const [data, setData] = useState<Protocolo86Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [view, setView] = useState<View>("pratos");
  const [search, setSearch] = useState("");
  const [classe, setClasse] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [sort, setSort] = useState("priority");
  const [page, setPage] = useState(1);
  const listHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let live = true;
    getProtocolo86Data(unit)
      .then((result) => {
        if (live) {
          setData(result);
          setError("");
        }
      })
      .catch((e) => {
        if (live)
          setError(
            e instanceof Error
              ? e.message
              : "Não foi possível carregar os dados.",
          );
      });
    return () => {
      live = false;
    };
  }, [unit, revision]);

  async function act(fn: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    let saved = false;
    try {
      await fn();
      saved = true;
      setData(await getProtocolo86Data(unit));
      setNotice(message);
    } catch (e) {
      setError(
        saved
          ? "Alteração salva. Não foi possível atualizar a tela; tente carregar novamente."
          : e instanceof Error
            ? e.message
            : "Não foi possível salvar. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }

  const houseName = (id: string) =>
    units.find((h) => h.id === id)?.name ?? "Casa não identificada";
  const changeView = (next: View) => {
    setView(next);
    setSearch("");
    setClasse("");
    setOnlyOpen(false);
    setPage(1);
    setSort("priority");
  };
  const clearFilters = () => {
    setSearch("");
    setClasse("");
    setOnlyOpen(false);
    setPage(1);
  };
  const filterClass = (value: string) => {
    setView("pratos");
    setSearch("");
    setOnlyOpen(false);
    setClasse(value);
    setPage(1);
  };

  const feedback = (
    <>
      {error && (
        <div role="alert" className={s.error}>
          <TriangleAlert size={18} aria-hidden="true" />
          <span>{error}</span>
          <button
            type="button"
            className={s.button}
            disabled={busy}
            onClick={() => {
              setError("");
              setRevision((r) => r + 1);
            }}
          >
            Tentar novamente
          </button>
        </div>
      )}
      <div role="status" aria-live="polite">
        {(notice || busy) && (
          <p className={s.notice}>
            {busy ? (
              <RefreshCw size={16} className={s.spin} aria-hidden="true" />
            ) : (
              <Check size={16} aria-hidden="true" />
            )}
            {busy ? "Salvando e atualizando a classificação…" : notice}
          </p>
        )}
      </div>
    </>
  );
  if (!data)
    return (
      <>
        {feedback}
        {!error && (
          <div className={s.loading} role="status">
            <RefreshCw size={22} className={s.spin} aria-hidden="true" />
            <strong>Preparando seu panorama</strong>
            <span>
              Reunindo pratos, limites e insumos das casas selecionadas.
            </span>
          </div>
        )}
      </>
    );

  const open = openSummary(data);
  const alerts = data.categorias.filter(
    (cat) =>
      limitState(
        open.categories.get(rowKey(cat.unit_id, cat.grupo)) ?? 0,
        cat.teto_86_simultaneo,
      ) !== "within",
  ).length;
  const month = new Date(data.mesAtual + "T12:00:00").toLocaleDateString(
    "pt-BR",
    { month: "long", year: "numeric" },
  );
  const query = normalizeSearch(search);
  const matches = (...values: (string | null)[]) =>
    normalizeSearch(values.filter(Boolean).join(" ")).includes(query);
  const dishes = data.pratos
    .filter(
      (p) =>
        (!classe || p.classe_86 === classe) &&
        (!onlyOpen || open.dishes.has(rowKey(p.unit_id, p.produto_id))) &&
        matches(p.nome, p.grupo, houseName(p.unit_id)),
    )
    .sort((a, b) => {
      if (sort === "name")
        return (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR");
      if (sort === "revenue")
        return (b.receita_12m ?? 0) - (a.receita_12m ?? 0);
      return (
        Number(open.dishes.has(rowKey(b.unit_id, b.produto_id))) -
          Number(open.dishes.has(rowKey(a.unit_id, a.produto_id))) ||
        classRank(a.classe_86) - classRank(b.classe_86) ||
        (b.receita_12m ?? 0) - (a.receita_12m ?? 0)
      );
    });
  const ingredients = data.insumos
    .filter(
      (i) =>
        (!classe || i.classe_herdada === classe) &&
        matches(i.nome_insumo, houseName(i.unit_id)),
    )
    .sort((a, b) => {
      if (sort === "name")
        return a.nome_insumo.localeCompare(b.nome_insumo, "pt-BR");
      if (sort === "revenue")
        return (b.receita_protegida ?? 0) - (a.receita_protegida ?? 0);
      return (
        b.n_pratos_protegidos - a.n_pratos_protegidos ||
        (b.receita_protegida ?? 0) - (a.receita_protegida ?? 0)
      );
    });
  const categories = data.categorias
    .filter((c) => matches(c.grupo, houseName(c.unit_id)))
    .sort((a, b) => {
      const urgency = (c: typeof a) =>
        ({ exceeded: 2, "at-limit": 1, within: 0 })[
          limitState(
            open.categories.get(rowKey(c.unit_id, c.grupo)) ?? 0,
            c.teto_86_simultaneo,
          )
        ];
      return urgency(b) - urgency(a) || a.grupo.localeCompare(b.grupo, "pt-BR");
    });
  const total =
    view === "pratos"
      ? dishes.length
      : view === "insumos"
        ? ingredients.length
        : categories.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const activeFilters = Boolean(search || classe || onlyOpen);
  const title = {
    pratos: "Proteção dos pratos",
    categorias: "Limites por categoria",
    insumos: "Insumos que sustentam o cardápio",
  }[view];

  return (
    <>
      {feedback}
      <div className={s.period}>
        <span>
          Panorama de <strong>{month}</strong>
        </span>
        <span>
          {unit ? houseName(unit) : "Consolidado · casas autorizadas"}
        </span>
      </div>
      <section className={s.metrics} aria-label="Panorama do mês">
        <article className={`${s.metric} ${s.moneyMetric}`}>
          <span>Receita não realizada · estimativa</span>
          <strong>{money(data.placar.rs_perdido_mes)}</strong>
          <small>Exposição calculada pelos dias de falta no mês.</small>
        </article>
        <button
          className={s.metric}
          type="button"
          onClick={() => {
            filterClass("INEGOCIAVEL");
            setOnlyOpen(true);
            listHeading.current?.focus();
            listHeading.current?.scrollIntoView({ block: "start" });
          }}
        >
          <span>
            <TriangleAlert size={16} aria-hidden="true" /> Inegociáveis em
            aberto
          </span>
          <strong className={open.critical ? s.dangerText : ""}>
            {open.critical}
          </strong>
          <small>
            Pratos prioritários <ArrowRight size={14} aria-hidden="true" />
          </small>
        </button>
        <button
          className={s.metric}
          type="button"
          onClick={() => {
            filterClass("");
            setOnlyOpen(true);
            listHeading.current?.focus();
            listHeading.current?.scrollIntoView({ block: "start" });
          }}
        >
          <span>
            <Utensils size={16} aria-hidden="true" /> Histórico e proteção de pratos
          </span>
          <strong>{open.dishes.size}</strong>
          <small>
            Em aberto nos registros do mês{" "}
            <ArrowRight size={14} aria-hidden="true" />
          </small>
        </button>
        <button
          className={s.metric}
          type="button"
          onClick={() => {
            changeView("categorias");
            listHeading.current?.focus();
            listHeading.current?.scrollIntoView({ block: "start" });
          }}
        >
          <span>
            <Layers3 size={16} aria-hidden="true" /> Categorias em atenção
          </span>
          <strong>{alerts}</strong>
          <small>
            No limite ou acima dele <ArrowRight size={14} aria-hidden="true" />
          </small>
        </button>
      </section>

      <details className={s.guide}>
        <summary>
          <CircleHelp size={16} aria-hidden="true" /> Como ler as prioridades e
          a estimativa <span>Entenda o protocolo</span>
        </summary>
        <div className={s.guideBody}>
          <p>
            86 é um prato indisponível para venda. A estimativa usa a receita
            dos últimos 12 meses dividida por 364 dias, multiplicada pelos dias
            em falta de cada episódio no mês. Não representa perda contábil
            confirmada. Os contadores de pratos abertos consideram os episódios
            presentes neste mês.
          </p>
          <div className={s.legend}>
            {CLASSES.map((c) => (
              <div key={c}>
                <Badge value={c} />
                <p>{CLASSE_DESCRIPTION[c]}</p>
                <small>{data.placar.por_classe[c]} episódios no mês</small>
              </div>
            ))}
          </div>
        </div>
      </details>

      <section
        className={s.workspace}
        aria-labelledby="protocol-list-heading"
        aria-busy={busy}
      >
        <nav className={s.views} aria-label="Visões do protocolo">
          {(
            [
              {
                id: "pratos",
                label: "Pratos",
                count: data.pratos.length,
                Icon: Utensils,
              },
              {
                id: "categorias",
                label: "Categorias",
                count: data.categorias.length,
                Icon: Layers3,
              },
              {
                id: "insumos",
                label: "Insumos",
                count: data.insumos.length,
                Icon: Package,
              },
            ] as const
          ).map(({ id, label, count, Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => changeView(id)}
            >
              <Icon size={17} aria-hidden="true" />
              {label}
              <span>{count}</span>
            </button>
          ))}
        </nav>
        <div className={s.sectionHead}>
          <div>
            <h2 id="protocol-list-heading" ref={listHeading} tabIndex={-1}>
              {title}
            </h2>
            <p>
              {view === "pratos"
                ? "As faltas aparecem primeiro. Revise a proteção e as assinaturas de cada casa."
                : view === "categorias"
                  ? "Defina quantos pratos podem ficar indisponíveis ao mesmo tempo. Limite zero significa nenhuma falta permitida."
                  : "Priorize os insumos usados por mais pratos protegidos e consulte o estoque."}
            </p>
          </div>
        </div>
        <div className={s.filters}>
          <label className={`${s.field} ${s.searchField}`}>
            <span>
              Buscar{" "}
              {view === "pratos"
                ? "prato, categoria ou casa"
                : view === "insumos"
                  ? "insumo ou casa"
                  : "categoria ou casa"}
            </span>
            <div className={s.searchBox}>
              <Search size={17} aria-hidden="true" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={
                  view === "pratos"
                    ? "Ex.: parrillada, wagyu…"
                    : view === "insumos"
                      ? "Ex.: manteiga, salmão…"
                      : "Ex.: da brasa…"
                }
                type="search"
              />
            </div>
          </label>
          {view !== "categorias" && (
            <label className={s.field}>
              Ordenar por
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(1);
                }}
              >
                <option value="priority">
                  {view === "pratos"
                    ? "Falta e prioridade"
                    : "Mais pratos protegidos"}
                </option>
                <option value="revenue">Maior receita</option>
                <option value="name">Nome A–Z</option>
              </select>
            </label>
          )}
        </div>
        {view !== "categorias" && (
          <div className={s.filterRow}>
            <div className={s.chips} aria-label="Filtrar por proteção">
              <button
                type="button"
                aria-pressed={!classe}
                onClick={() => {
                  setClasse("");
                  setPage(1);
                }}
              >
                Todas
              </button>
              {(view === "insumos" ? CLASSES.slice(0, 2) : CLASSES).map((c) => (
                <button
                  key={c}
                  type="button"
                  data-class={c}
                  aria-pressed={classe === c}
                  onClick={() => {
                    setClasse(c);
                    setPage(1);
                  }}
                >
                  {CLASSE_LABEL[c]}
                </button>
              ))}
            </div>
            {view === "pratos" && (
              <label className={s.openFilter}>
                <input
                  type="checkbox"
                  checked={onlyOpen}
                  onChange={(e) => {
                    setOnlyOpen(e.target.checked);
                    setPage(1);
                  }}
                />
                Só em 86
              </label>
            )}
          </div>
        )}
        <div className={s.resultCount}>
          <span role="status">
            {total}{" "}
            {total === 1
              ? { pratos: "prato", categorias: "categoria", insumos: "insumo" }[
                  view
                ]
              : view}
            {activeFilters
              ? total === 1
                ? view === "categorias"
                  ? " encontrada"
                  : " encontrado"
                : view === "categorias"
                  ? " encontradas"
                  : " encontrados"
              : " no total"}
          </span>
          {activeFilters && (
            <button type="button" onClick={clearFilters}>
              <X size={14} aria-hidden="true" /> Limpar filtros
            </button>
          )}
        </div>

        {total === 0 ? (
          <div className={s.empty}>
            <Search size={26} aria-hidden="true" />
            <h3>
              {activeFilters
                ? "Nenhum resultado para estes filtros"
                : `Nenhum registro de ${view} neste escopo`}
            </h3>
            <p>
              {activeFilters
                ? "Tente outro nome ou remova os filtros para ampliar a busca."
                : "Selecione outra casa ou confira os vínculos do cardápio."}
            </p>
            {activeFilters && (
              <button className={s.button} type="button" onClick={clearFilters}>
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <>
            {view === "pratos" && (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <caption className={s.srOnly}>
                    Proteção, receita e assinatura de cada prato
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Prato / casa</th>
                      <th scope="col">Proteção</th>
                      <th scope="col" className={s.number}>
                        Receita · 12 meses
                      </th>
                      <th scope="col">Assinatura da casa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dishes.slice(start, start + PAGE_SIZE).map((p) => {
                      const in86 = open.dishes.has(
                        rowKey(p.unit_id, p.produto_id),
                      );
                      return (
                        <tr
                          key={rowKey(p.unit_id, p.produto_id)}
                          data-open={in86}
                        >
                          <td data-label="Prato">
                            <div className={s.dishName}>
                              <strong>{p.nome ?? "Prato sem nome"}</strong>
                              {in86 && (
                                <span className={s.openBadge}>Em 86</span>
                              )}
                            </div>
                            <small>
                              {p.grupo ?? "Sem categoria"} ·{" "}
                              {houseName(p.unit_id)}
                            </small>
                          </td>
                          <td data-label="Proteção">
                            <Badge value={p.classe_86} />
                          </td>
                          <td
                            data-label="Receita · 12 meses"
                            className={s.number}
                          >
                            {money(p.receita_12m)}
                          </td>
                          <td data-label="Assinatura">
                            <label className={s.signature}>
                              <input
                                type="checkbox"
                                checked={p.assinatura}
                                disabled={busy}
                                aria-label={`Assinatura de ${p.nome ?? "prato"} · ${houseName(p.unit_id)}`}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  void act(
                                    () =>
                                      toggleAssinatura(
                                        p.unit_id,
                                        p.nome_venda_key,
                                        checked,
                                      ),
                                    `Assinatura de “${p.nome}” ${checked ? "ativada" : "removida"}.`,
                                  );
                                }}
                              />
                              <span>
                                {p.assinatura ? "Assinatura" : "Marcar"}
                              </span>
                            </label>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {view === "categorias" && (
              <div className={s.categories}>
                {categories.slice(start, start + PAGE_SIZE).map((cat) => (
                  <CategoryCard
                    key={rowKey(cat.unit_id, cat.grupo)}
                    cat={cat}
                    house={houseName(cat.unit_id)}
                    open={
                      open.categories.get(rowKey(cat.unit_id, cat.grupo)) ?? 0
                    }
                    busy={busy}
                    onSave={(value) =>
                      act(
                        () => saveTeto(cat.unit_id, cat.grupo, value),
                        `Limite de “${cat.grupo}” salvo: ${value}.`,
                      )
                    }
                  />
                ))}
              </div>
            )}
            {view === "insumos" && (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <caption className={s.srOnly}>
                    Dependência dos pratos protegidos por insumo
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Insumo / casa</th>
                      <th scope="col">Proteção herdada</th>
                      <th scope="col" className={s.number}>
                        Pratos protegidos
                      </th>
                      <th scope="col" className={s.number}>
                        Receita dos pratos
                      </th>
                      <th scope="col">
                        <span className={s.srOnly}>Ação</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ingredients.slice(start, start + PAGE_SIZE).map((i) => (
                      <tr key={rowKey(i.unit_id, i.insumo_id)}>
                        <td data-label="Insumo">
                          <strong>{i.nome_insumo}</strong>
                          <small>{houseName(i.unit_id)}</small>
                        </td>
                        <td data-label="Proteção">
                          <Badge value={i.classe_herdada} />
                        </td>
                        <td data-label="Pratos protegidos" className={s.number}>
                          {i.n_pratos_protegidos}
                        </td>
                        <td
                          data-label="Receita dos pratos"
                          className={s.number}
                        >
                          {money(i.receita_protegida)}
                        </td>
                        <td>
                          <Link
                            className={s.stockLink}
                            href={`/compras/estoque?item=${i.insumo_id}`}
                            aria-label={`Ver estoque de ${i.nome_insumo}`}
                          >
                            Ver estoque{" "}
                            <ArrowRight size={14} aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className={s.pagination}>
              <span>
                {start + 1}–{Math.min(start + PAGE_SIZE, total)} de {total}
              </span>
              <div>
                <button
                  type="button"
                  className={s.button}
                  aria-label="Página anterior"
                  disabled={currentPage === 1}
                  onClick={() => {
                    setPage(currentPage - 1);
                    listHeading.current?.focus();
                    listHeading.current?.scrollIntoView({ block: "start" });
                  }}
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>
                <span>
                  Página {currentPage} de {totalPages}
                </span>
                <button
                  type="button"
                  className={s.button}
                  aria-label="Próxima página"
                  disabled={currentPage === totalPages}
                  onClick={() => {
                    setPage(currentPage + 1);
                    listHeading.current?.focus();
                    listHeading.current?.scrollIntoView({ block: "start" });
                  }}
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          </>
        )}
        {view === "insumos" && (
          <p className={s.footnote}>
            A receita pertence aos pratos que usam o insumo. Um mesmo prato pode
            aparecer em vários insumos; estes valores não devem ser somados.
          </p>
        )}
        {view === "pratos" && (
          <p className={s.footnote}>
            Marcar uma assinatura atualiza a proteção do prato e dos insumos
            vinculados. A indisponibilidade é acompanhada na fila de
            abastecimento.
          </p>
        )}
      </section>
    </>
  );
}

function CategoryCard({
  cat,
  house,
  open,
  busy,
  onSave,
}: {
  cat: Protocolo86Data["categorias"][number];
  house: string;
  open: number;
  busy: boolean;
  onSave: (value: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState(String(cat.teto_86_simultaneo));
  const state = limitState(open, cat.teto_86_simultaneo);
  const value = Number(draft);
  const valid =
    draft.trim() !== "" && Number.isInteger(value) && value >= 0 && value <= 99;
  return (
    <article className={s.category} data-state={state}>
      <div className={s.categoryTitle}>
        <div>
          <small>{house}</small>
          <h3>{cat.grupo}</h3>
        </div>
        {cat.critica && (
          <span className={s.criticalTag}>
            <ShieldCheck size={13} aria-hidden="true" /> Crítica
          </span>
        )}
      </div>
      <div className={s.categoryNumbers}>
        <p>
          <strong>{open}</strong>
          <span>pratos em 86</span>
        </p>
        <span>/</span>
        <p>
          <strong>{cat.teto_86_simultaneo}</strong>
          <span>limite simultâneo</span>
        </p>
      </div>
      <div className={s.limitStatus}>
        {state === "within" ? (
          <Check size={15} aria-hidden="true" />
        ) : (
          <TriangleAlert size={15} aria-hidden="true" />
        )}
        {state === "exceeded"
          ? `${open - cat.teto_86_simultaneo} acima do limite`
          : state === "at-limit"
            ? "No limite · atenção à próxima falta"
            : cat.teto_86_simultaneo === 0
              ? "Nenhuma falta permitida"
              : "Dentro do limite"}
      </div>
      <details className={s.editLimit}>
        <summary>Ajustar limite</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) void onSave(value);
          }}
        >
          <label className={s.field}>
            Máximo de pratos em falta
            <input
              type="number"
              min={0}
              max={99}
              step={1}
              required
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={busy}
              aria-label={`Limite de ${cat.grupo} · ${house}`}
            />
          </label>
          <button
            type="submit"
            className={s.button}
            disabled={busy || !valid || value === cat.teto_86_simultaneo}
          >
            <Check size={15} aria-hidden="true" /> Salvar
          </button>
        </form>
      </details>
    </article>
  );
}
