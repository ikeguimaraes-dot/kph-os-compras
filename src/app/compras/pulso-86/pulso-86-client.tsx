"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  CircleAlert,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { useAuth } from "@kph/auth/context";
import { getPulso86Data, type Pulso86Data } from "./pulso-86-actions";
import s from "./pulso-86.module.css";

type Row = Pulso86Data["itens"][number];

const HOUSE_ORDER = ["Meet & Eat", "Madonna", "Match", "Frêneze"];
const CAUSA_LABEL: Record<string, string> = {
  compra_gestao: "Compra",
  compras: "Compra",
  producao: "Produção",
  producao_planejamento: "Produção",
  sazonalidade: "Sazonalidade",
  padrao_qualidade: "Fora do padrão",
  fornecedor_ruptura: "Fornecedor",
  fornecedor: "Fornecedor",
  quebra: "Quebra",
};
const CLASSE_LABEL: Record<string, string> = {
  INEGOCIAVEL: "Inegociável",
  PROTEGIDO: "Protegido",
  GERENCIAVEL: "Gerenciável",
  LIVRE: "Livre",
};

function houseRank(name: string) {
  const i = HOUSE_ORDER.findIndex((h) =>
    name.includes(h.split(" ")[0] ?? h),
  );
  return i === -1 ? HOUSE_ORDER.length : i;
}
function classRank(c: string | null) {
  const order = ["INEGOCIAVEL", "PROTEGIDO", "GERENCIAVEL", "LIVRE"];
  const i = c ? order.indexOf(c) : -1;
  return i === -1 ? order.length : i;
}
function fmtData(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function hojeSp() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
  )
    .toISOString()
    .slice(0, 10);
}

function ClasseBadge({ value }: { value: string | null }) {
  if (!value) return <span className={s.badge}>—</span>;
  return (
    <span className={s.badge} data-class={value}>
      {CLASSE_LABEL[value] ?? value}
    </span>
  );
}

export default function Pulso86Client() {
  const { unitId, units, setUnitId } = useAuth();
  const unit = unitId === "all" ? null : (unitId ?? null);
  return (
    <div className={s.page}>
      <header className={s.header}>
        <div>
          <p className={s.eyebrow}>
            <Activity size={15} aria-hidden="true" /> GHOST · RELAÇÃO DIÁRIA
          </p>
          <h1>
            Pulso <em>86.</em>
          </h1>
          <p className={s.intro}>
            O que está faltando agora, casa a casa.
            <br />
            86 fora do ar, 85 para repor antes que vire 86.
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
          <Link className={s.primary} href="/compras/protocolo-86">
            Abrir Protocolo 86 <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </header>
      <Workspace key={unit ?? "all"} unit={unit} />
    </div>
  );
}

function Workspace({ unit }: { unit: string | null }) {
  const [data, setData] = useState<Pulso86Data | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let live = true;
    getPulso86Data(unit)
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

  const casas = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { casa: string; data: string; rows: Row[] }>();
    for (const row of data.itens) {
      const entry = map.get(row.unit_id) ?? {
        casa: row.casa,
        data: row.data,
        rows: [],
      };
      entry.rows.push(row);
      map.set(row.unit_id, entry);
    }
    return [...map.entries()]
      .map(([unit_id, v]) => ({ unit_id, ...v }))
      .sort((a, b) => houseRank(a.casa) - houseRank(b.casa));
  }, [data]);

  if (error)
    return (
      <p className={s.error} role="alert">
        <CircleAlert size={15} aria-hidden="true" /> {error}{" "}
        <button type="button" onClick={() => setRevision((r) => r + 1)}>
          <RefreshCw size={13} aria-hidden="true" /> Tentar de novo
        </button>
      </p>
    );
  if (!data) return <p className={s.loading}>Carregando o pulso do dia…</p>;
  if (casas.length === 0)
    return (
      <p className={s.loading}>
        Nenhum relatório diário registrado para este filtro.
      </p>
    );

  const inegociaveis = data.itens.filter(
    (r) => r.tipo === "86" && r.classe_86 === "INEGOCIAVEL",
  );
  const estourados = data.tetos.filter((t) => t.estourado);
  const hoje = hojeSp();

  return (
    <div className={s.body}>
      {(inegociaveis.length > 0 || estourados.length > 0) && (
        <section className={s.alerts} aria-label="Alertas do protocolo">
          {inegociaveis.length > 0 && (
            <article className={s.alert}>
              <h2>
                <ShieldAlert size={16} aria-hidden="true" /> Inegociável em 86
              </h2>
              <ul>
                {inegociaveis.map((r) => (
                  <li key={r.op_86_id}>
                    <strong>{r.casa}</strong> · {r.item}
                  </li>
                ))}
              </ul>
            </article>
          )}
          {estourados.length > 0 && (
            <article className={s.alert}>
              <h2>
                <TriangleAlert size={16} aria-hidden="true" /> Teto de categoria
                estourado
              </h2>
              <ul>
                {estourados.map((t) => (
                  <li key={`${t.unit_id}-${t.grupo}`}>
                    <strong>{t.casa}</strong> · {t.grupo}: {t.n_86} em 86
                    (teto {t.teto})
                  </li>
                ))}
              </ul>
            </article>
          )}
        </section>
      )}

      <div className={s.houses}>
        {casas.map((casa) => {
          const em86 = casa.rows
            .filter((r) => r.tipo === "86")
            .sort(
              (a, b) =>
                classRank(a.classe_86) - classRank(b.classe_86) ||
                (b.receita_12m ?? 0) - (a.receita_12m ?? 0),
            );
          const em85 = casa.rows
            .filter((r) => r.tipo === "85")
            .sort((a, b) => (b.receita_12m ?? 0) - (a.receita_12m ?? 0));
          const atrasado = casa.data < hoje;
          return (
            <section key={casa.unit_id} className={s.house}>
              <header className={s.houseHeader}>
                <h2>{casa.casa}</h2>
                <div className={s.houseMeta}>
                  <span>
                    {em86.length} em 86 · {em85.length} em 85
                  </span>
                  <span
                    className={s.dateBadge}
                    data-stale={atrasado || undefined}
                  >
                    {atrasado
                      ? `relatório de ${fmtData(casa.data)}`
                      : `hoje, ${fmtData(casa.data)}`}
                  </span>
                </div>
              </header>
              {em86.length > 0 && (
                <ul className={s.items}>
                  {em86.map((r) => (
                    <li key={r.op_86_id} className={s.item}>
                      <div className={s.itemMain}>
                        <strong>{r.item}</strong>
                        <ClasseBadge value={r.classe_86} />
                        <span className={s.causa}>
                          {(r.causa && CAUSA_LABEL[r.causa]) || "—"}
                        </span>
                        {r.grupo && <span className={s.grupo}>{r.grupo}</span>}
                      </div>
                      {r.observacao && (
                        <p className={s.obs}>{r.observacao}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {em85.length > 0 && (
                <div className={s.repor}>
                  <h3>Alerta 85 — repor</h3>
                  <ul className={s.items}>
                    {em85.map((r) => (
                      <li key={r.op_86_id} className={s.item}>
                        <div className={s.itemMain}>
                          <strong>{r.item}</strong>
                          <ClasseBadge value={r.classe_86} />
                          {r.grupo && (
                            <span className={s.grupo}>{r.grupo}</span>
                          )}
                        </div>
                        {r.observacao && (
                          <p className={s.obs}>{r.observacao}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
