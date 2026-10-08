"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  getSupply,
  saveSupply,
  confirmKitchen,
  saveAgreement,
  saveSupplyConfig,
  saveDishRole,
  requestDishRemoval,
  approveDishRemoval,
  searchSupplyItems,
} from "@/lib/compras/abastecimento-actions";
import { CAUSAS, TIPOS, STATUS } from "@/lib/compras/abastecimento-engine";
import "./supply.css";
const money = (n: unknown) =>
  n == null
    ? "A validar"
    : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (n: unknown) =>
  n == null ? "Não medido" : `${(Number(n) * 100).toFixed(1)}%`;
const human = (s: string) => s.replaceAll("_", " ");
type Mode = "rotina" | "acordos" | "cardapio" | "estrategia";
type Data = Awaited<ReturnType<typeof getSupply>>;
const value = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const nullable = (f: FormData, k: string) => value(f, k) || null;
const number = (f: FormData, k: string) => Number(f.get(k) ?? 0);
export default function SupplyClient({ mode = "rotina" }: { mode?: Mode }) {
  const [unit, setUnit] = useState<string | null>(null),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("");
  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    getSupply(unit, mode)
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [unit, revision, mode]);
  async function act(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(message);
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  const house = (id: string) =>
    data?.units.find((u) => u.id === id)?.name ?? "Casa";
  const filtered =
    data?.fila
      .slice()
      .sort((a, b) => b.dia.localeCompare(a.dia))
      .filter(
        (r) =>
          (!status || r.status === status) &&
          `${r.produto_nome} ${r.fornecedor_nome} ${r.responsavel ?? ""}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ) ?? [];
  const opened =
    data?.fila.filter((r) => !["retomado", "planejado"].includes(r.status)) ??
    [];
  const titles = {
    rotina: "Abastecimento do dia.",
    acordos: "Acordos que devolvem pratos.",
    cardapio: "O papel de cada prato.",
    estrategia: "Planejamento estratégico.",
  };
  return (
    <main className="supply">
      <nav aria-label="Abastecimento">
        <a href="/compras/prisma">← Prisma</a>
        {[
          ["/compras/abastecimento", "Rotina"],
          ["/compras/prisma/mapa", "Mapa de dependências"],
          ["/compras/abastecimento/acordos", "Acordos"],
          ["/compras/abastecimento/cardapio", "Papel na marca"],
          ["/compras/abastecimento/matriz", "Matriz e cotações"],
          ["/compras/fichas", "Revisar fichas"],
          ["/compras/prisma/estrategia", "Estratégia"],
        ].map(([href, label]) => (
          <a key={href} href={href}>
            {label}
          </a>
        ))}
      </nav>
      <header>
        <p className="eyebrow">GRUPO KPH · COMPRAS</p>
        <h1>{titles[mode]}</h1>
        <p>Cardápio vendável, marca protegida e caixa na mesma decisão.</p>
      </header>
      <label>
        Casa
        <select
          value={unit ?? ""}
          onChange={(e) => setUnit(e.target.value || null)}
        >
          <option value="">Todas as casas autorizadas</option>
          {data?.units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="alert" role="alert">
          {error}{" "}
          <button onClick={() => setRevision((r) => r + 1)}>Recarregar</button>
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {!data ? (
        <p role="status">Conferindo operação, compras e títulos…</p>
      ) : (
        <>
          <p className="muted">
            Dono da fila: {data.config.dono_fila || "A definir por Ike"} ·
            posição em {data.today} · sugestões aguardam confirmação da
            operação.
          </p>
          {mode === "rotina" && (
            <>
              <section className="metrics" aria-label="Cinco perguntas do dia">
                <article>
                  <small>O que está bloqueado?</small>
                  <strong>{opened.length}</strong>
                  <p>Registros abertos; podem repetir o mesmo prato.</p>
                </article>
                <article>
                  <small>O que pode faltar?</small>
                  <strong>
                    {opened.filter((r) => !r.causa_confirmada_em).length}
                  </strong>
                  <p>
                    Causas ainda a confirmar. Sem estoque validado, não há
                    previsão automática de ruptura.
                  </p>
                </article>
                <article>
                  <small>Quanto sai do caixa?</small>
                  <strong>
                    {data.config.teto_caixa_7d == null
                      ? "Teto pendente"
                      : money(data.config.teto_caixa_7d)}
                  </strong>
                  <a href="/compras/abastecimento/acordos">
                    Conferir propostas →
                  </a>
                </article>
                <article>
                  <small>O que chega?</small>
                  <strong>
                    {
                      opened.filter((r) => r.status === "aguardando_entrega")
                        .length
                    }
                  </strong>
                  <p>Retornos aguardando entrega confirmada.</p>
                </article>
                <article>
                  <small>Quem confirma retomada?</small>
                  <strong>
                    {opened.filter((r) => !r.retomada_cozinha_em).length}
                  </strong>
                  <p>
                    Confirmações da cozinha pendentes. Qualidade exige chef.
                  </p>
                </article>
              </section>
              <div className="filters">
                <label>
                  Buscar prato, fornecedor ou responsável
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <label>
                  Situação
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="">Todas</option>
                    {STATUS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>
              <p>
                {filtered.length} registros · mostrando até 100; use os filtros
                para localizar.
              </p>
              {filtered.slice(0, 100).map((r) => (
                <details className="panel" key={r.id}>
                  <summary>
                    <strong>{r.produto_nome}</strong> · {house(r.unit_id)} ·{" "}
                    {r.dia} · {human(r.status)}{" "}
                    {r.tipo === "qualidade" ||
                    r.motivo_original === "padrao_qualidade"
                      ? " · QUALIDADE"
                      : ""}
                  </summary>
                  <p>
                    {r.observacao || r.motivo_original} · turno {r.periodo} ·
                    relatório {r.relatorio_status}
                  </p>
                  <p>{r.sugestao_detalhe}</p>
                  <p>
                    <strong>
                      {r.fornecedor_nome ?? "Fornecedor a confirmar"}
                    </strong>{" "}
                    · última nota: {r.ultima_nota ?? "não localizada"} · vencido
                    desta casa: {money(r.vencido_rs)} (a conciliar)
                  </p>
                  <p>
                    Prato sugerido: {r.prato_sugerido ?? "A vincular"} · insumo:{" "}
                    {r.insumo_sugerido ?? "A identificar"}
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void act(
                        () =>
                          saveSupply({
                            id: r.id,
                            unit_id: r.unit_id,
                            version: r.atualizado_em,
                            produto_venda_ficha_id: value(f, "prato"),
                            tipo: value(f, "tipo"),
                            causa: value(f, "causa"),
                            insumo_id: nullable(f, "insumo"),
                            fornecedor_raiz: nullable(f, "fornecedor"),
                            responsavel: value(f, "responsavel"),
                            proxima_acao: value(f, "acao"),
                            prazo: value(f, "prazo"),
                            previsao_retorno: value(f, "retorno"),
                            status: value(f, "status"),
                            inicio_confirmado_em: value(f, "inicio")
                              ? new Date(value(f, "inicio")).toISOString()
                              : null,
                          }),
                        "Causa e plano de retorno registrados.",
                      );
                    }}
                  >
                    <div className="fields">
                      <label>
                        Prato e porção
                        <select
                          name="prato"
                          required
                          defaultValue={
                            r.produto_venda_ficha_id ??
                            r.sugestao_prato_id ??
                            ""
                          }
                        >
                          <option value="">Confirmar identidade</option>
                          {data.pratos
                            .filter((p) => p.unit_id === r.unit_id)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.nome_venda_original || p.nome_venda}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        Tipo
                        <select
                          name="tipo"
                          required
                          defaultValue={r.tipo ?? ""}
                        >
                          <option value="">Confirmar tipo</option>
                          {TIPOS.map((t) => (
                            <option key={t} value={t}>
                              {human(t)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Causa
                        <select
                          name="causa"
                          defaultValue={r.causa ?? r.sugestao_causa ?? ""}
                        >
                          {CAUSAS.map((c) => (
                            <option key={c} value={c}>
                              {human(c)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <ItemPicker
                        name="insumo"
                        initial={r.insumo_id ?? r.sugestao_insumo_id ?? ""}
                        label={r.insumo_sugerido ?? "Confirmar insumo"}
                      />
                      <label>
                        Fornecedor (raiz de CNPJ)
                        <input
                          name="fornecedor"
                          defaultValue={
                            r.fornecedor_raiz ??
                            r.sugestao_fornecedor_raiz ??
                            ""
                          }
                        />
                      </label>
                      <label>
                        Responsável
                        <input
                          name="responsavel"
                          required
                          defaultValue={r.responsavel ?? ""}
                        />
                      </label>
                      <label>
                        Próxima ação
                        <input
                          name="acao"
                          required
                          defaultValue={r.proxima_acao ?? ""}
                        />
                      </label>
                      <label>
                        Prazo
                        <input
                          type="date"
                          name="prazo"
                          required
                          defaultValue={r.prazo ?? ""}
                        />
                      </label>
                      <label>
                        Previsão de retorno
                        <input
                          type="date"
                          name="retorno"
                          required
                          defaultValue={r.previsao_retorno ?? ""}
                        />
                      </label>
                      <label>
                        Início real do bloqueio (se conhecido)
                        <input type="datetime-local" name="inicio" />
                      </label>
                      <label>
                        Situação
                        <select
                          name="status"
                          defaultValue={
                            r.status === "aberto"
                              ? "causa_confirmada"
                              : r.status
                          }
                        >
                          {STATUS.filter((s) => s !== "retomado").map((s) => (
                            <option key={s} value={s}>
                              {human(s)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <button disabled={busy || !data.canEdit}>
                      Confirmar causa e salvar
                    </button>
                  </form>
                  <p>
                    Cozinha:{" "}
                    {r.retomada_cozinha_em ? "retomada confirmada" : "pendente"}{" "}
                    · PDV:{" "}
                    {r.retomada_pdv_em
                      ? `venda observada em ${String(r.retomada_pdv_em).slice(0, 10)}`
                      : "sem evidência de retorno"}
                    . Venda não comprova resolução da qualidade.
                  </p>
                  <button
                    disabled={busy || !data.canEdit || !!r.retomada_cozinha_em}
                    onClick={() =>
                      void act(
                        () =>
                          confirmKitchen({
                            id: r.id,
                            unit: r.unit_id,
                            version: r.atualizado_em,
                          }),
                        "Retomada da cozinha registrada.",
                      )
                    }
                  >
                    Confirmar retomada na cozinha
                  </button>
                </details>
              ))}
              <section className="panel">
                <h2>Conciliação dirigida</h2>
                <p>
                  Títulos ativos dos fornecedores ligados aos bloqueios. Baixas
                  e correções são feitas no Everest.
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Casa / fornecedor</th>
                        <th>Título / parcela</th>
                        <th>Vencimento</th>
                        <th>Saldo</th>
                        <th>Conferência</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.titulos.map((t) => (
                        <tr key={t.id}>
                          <th>
                            {house(t.unit_id)} · {t.fornecedor_nome}
                          </th>
                          <td>
                            {t.nr_titulo}/{t.nr_parcela}
                          </td>
                          <td>{t.dt_vencimento}</td>
                          <td>{money(t.vl_saldo)}</td>
                          <td>
                            {t.dias_atraso} dias ·{" "}
                            {t.conciliar
                              ? "Conciliar (>60 dias)"
                              : "Conferir saldo e liberação"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {mode === "acordos" && (
            <>
              <section className="panel">
                <h2>Teto de caixa para sete dias</h2>
                <p>
                  {data.budgetCurrent
                    ? "Janela vigente"
                    : "Janela não definida ou vencida"}{" "}
                  · selecione todas as casas para distribuir o teto do grupo. O
                  ranking não realiza nem autoriza pagamentos.
                </p>
                {data.founder ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void act(
                        () =>
                          saveSupplyConfig({
                            teto_caixa_7d: value(f, "teto")
                              ? number(f, "teto")
                              : null,
                            inicio: nullable(f, "inicio"),
                            fator_migracao: number(f, "fator"),
                            dono_fila: nullable(f, "dono"),
                          }),
                        "Decisões da fila salvas.",
                      );
                    }}
                  >
                    <div className="fields">
                      <label>
                        Teto (R$)
                        <input
                          name="teto"
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={data.config.teto_caixa_7d ?? ""}
                        />
                      </label>
                      <label>
                        Início da janela
                        <input
                          name="inicio"
                          type="date"
                          defaultValue={data.config.inicio ?? ""}
                        />
                      </label>
                      <label>
                        Fator de demanda recuperada
                        <input
                          name="fator"
                          type="number"
                          min="0"
                          max="1"
                          step="0.05"
                          required
                          defaultValue={data.config.fator_migracao}
                        />
                      </label>
                      <label>
                        Dono único da fila
                        <input
                          name="dono"
                          defaultValue={data.config.dono_fila ?? ""}
                        />
                      </label>
                    </div>
                    <button disabled={busy}>Salvar definição do founder</button>
                  </form>
                ) : (
                  <p>Teto e dono da fila são definidos pelo founder.</p>
                )}
              </section>
              <section className="panel">
                <h2>Ordem recomendada</h2>
                <p>
                  Contribuição histórica por dia disponível × dias de retorno ×
                  fator de demanda. Sem custo validado, fica fora do ranking.
                  Benefícios repetidos exigem consolidar as propostas.
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Fornecedor / casa</th>
                        <th>Desembolso</th>
                        <th>Contribuição 7 / 14 dias</th>
                        <th>Contribuição com recebimento em 7 dias</th>
                        <th>Retorno por R$</th>
                        <th>Teto / pendência</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.acordos.map((a) => (
                        <tr key={a.id}>
                          <th>
                            {data.fila.find(
                              (r) =>
                                (r.fornecedor_raiz ??
                                  r.sugestao_fornecedor_raiz) ===
                                a.fornecedor_raiz,
                            )?.fornecedor_nome ?? a.fornecedor_raiz}{" "}
                            · {house(a.unit_id)}
                          </th>
                          <td>{money(a.desembolso_total_rs)}</td>
                          <td>
                            {money(a.c7)} / {money(a.c14)}
                          </td>
                          <td>
                            {money(a.recebimento7)}
                            <small>
                              Estimativa após o prazo de recebimento; não é
                              saldo bancário.
                            </small>
                          </td>
                          <td>{a.score?.toFixed(2) ?? "A validar"}</td>
                          <td>
                            {!a.eligible
                              ? "Confirmar custo, entrega, qualidade e insumos"
                              : a.overlap
                                ? "Prato já contemplado"
                                : a.fits
                                  ? "Cabe no teto"
                                  : "Fora do teto ou teto pendente"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!data.acordos.length && <p>Nenhum acordo cadastrado.</p>}
              </section>
              <AgreementForm data={data} busy={busy} act={act} />
            </>
          )}
          {mode === "cardapio" && (
            <>
              <p>
                Assinatura protege a identidade da casa; classificação econômica
                depende de custo e dias disponíveis. Uma aprovação isolada não
                autoriza retirada.
              </p>
              <form
                className="panel"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const prato = data.pratos.find(
                    (p) => p.id === value(f, "prato"),
                  );
                  if (prato)
                    void act(
                      () =>
                        saveDishRole({
                          unit: prato.unit_id,
                          prato: prato.id,
                          papel: value(f, "papel"),
                        }),
                      "Papel do prato salvo.",
                    );
                }}
              >
                <div className="fields">
                  <label>
                    Prato
                    <select name="prato" required>
                      <option value="">Escolha</option>
                      {data.pratos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {house(p.unit_id)} · {p.nome_venda_original}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Papel
                    <select name="papel">
                      <option value="assinatura">Assinatura</option>
                      <option value="nucleo">Núcleo</option>
                      <option value="complemento">Complemento</option>
                    </select>
                  </label>
                </div>
                <button disabled={busy || !data.canEdit}>
                  Salvar papel na marca
                </button>
              </form>
              {data.papeis.map((p) => (
                <section className="panel" key={p.produto_venda_ficha_id}>
                  <h2>
                    {
                      data.pratos.find((d) => d.id === p.produto_venda_ficha_id)
                        ?.nome_venda_original
                    }
                  </h2>
                  <p>
                    {house(p.unit_id)} · {p.papel}
                  </p>
                  {p.papel === "assinatura" &&
                    (p.retirada_solicitada_em ? (
                      <>
                        <p>{p.retirada_motivo}</p>
                        <p>
                          {p.retirada_aprovada_em
                            ? "Retirada aprovada por duas pessoas. Executar a mudança no cardápio e no PDV pela rotina da operação."
                            : "Aguardando founder e chef da casa."}
                        </p>
                        <p>
                          {data.approvals
                            .filter(
                              (a) =>
                                a.produto_venda_ficha_id ===
                                  p.produto_venda_ficha_id &&
                                a.solicitacao_em === p.retirada_solicitada_em,
                            )
                            .map((a) => human(a.papel_aprovador))
                            .join(" + ") || "Sem aprovações"}
                        </p>
                        <button
                          disabled={busy || !!p.retirada_aprovada_em}
                          onClick={() =>
                            void act(
                              () =>
                                approveDishRemoval({
                                  unit: p.unit_id,
                                  prato: p.produto_venda_ficha_id,
                                  solicitacao: p.retirada_solicitada_em,
                                }),
                              "Seu voto foi registrado. A retirada só fica aprovada com founder e chef distintos.",
                            )
                          }
                        >
                          Registrar minha aprovação
                        </button>
                      </>
                    ) : (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void act(
                            () =>
                              requestDishRemoval({
                                unit: p.unit_id,
                                prato: p.produto_venda_ficha_id,
                                motivo: value(f, "motivo"),
                              }),
                            "Solicitação criada; requer founder e chef.",
                          );
                        }}
                      >
                        <label>
                          Motivo para retirada permanente
                          <input name="motivo" required />
                        </label>
                        <button disabled={busy}>
                          Solicitar duas aprovações
                        </button>
                      </form>
                    ))}
                </section>
              ))}
            </>
          )}
          {mode === "estrategia" && <Strategy data={data} house={house} />}
        </>
      )}
    </main>
  );
}
function ItemPicker({
  name,
  initial,
  label,
}: {
  name: string;
  initial: string;
  label: string;
}) {
  const [term, setTerm] = useState(""),
    [options, setOptions] = useState<{ id: string; descricao: string }[]>([]),
    [error, setError] = useState("");
  return (
    <div>
      <label>
        Insumo
        <select name={name} defaultValue={initial}>
          <option value="">Não identificado</option>
          {initial && <option value={initial}>{label}</option>}
          {options
            .filter((o) => o.id !== initial)
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.descricao}
              </option>
            ))}
        </select>
      </label>
      <label>
        Buscar insumo
        <input value={term} onChange={(e) => setTerm(e.target.value)} />
      </label>
      <button
        type="button"
        onClick={() => {
          searchSupplyItems(term)
            .then(setOptions)
            .catch((e) => setError(e.message));
        }}
      >
        Buscar
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
function AgreementForm({
  data,
  busy,
  act,
}: {
  data: Data;
  busy: boolean;
  act: (fn: () => Promise<unknown>, s: string) => Promise<void>;
}) {
  const [unit, setUnit] = useState(data.units[0]?.id ?? ""),
    [selected, setSelected] = useState("");
  const old = data.rawAgreements.find((a) => a.id === selected);
  const roots = [
    ...new Map(
      data.fila
        .filter((f) => f.unit_id === unit)
        .map((f) => [
          f.fornecedor_raiz ?? f.sugestao_fornecedor_raiz,
          f.fornecedor_nome,
        ]),
    ).entries(),
  ].filter(([r]) => r);
  return (
    <details className="panel">
      <summary>Cadastrar ou editar proposta de acordo</summary>
      <label>
        Proposta
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            const a = data.rawAgreements.find((a) => a.id === e.target.value);
            if (a) setUnit(a.unit_id);
          }}
        >
          <option value="">Nova proposta</option>
          {data.rawAgreements.map((a) => (
            <option key={a.id} value={a.id}>
              {a.fornecedor_raiz} · {a.status} · {money(a.desembolso_total_rs)}
            </option>
          ))}
        </select>
      </label>
      <form
        key={`${selected}|${old?.atualizado_em}`}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void act(
            () =>
              saveAgreement({
                id: old?.id,
                version: old?.atualizado_em,
                unit_id: unit,
                fornecedor_raiz: value(f, "fornecedor"),
                pratos_liberados: f.getAll("pratos").map(String),
                entrada_divida_rs: number(f, "entrada"),
                compra_nova_rs: number(f, "compra"),
                frete_rs: number(f, "frete"),
                data_entrega: nullable(f, "entrega"),
                entrega_confirmada: f.has("entrega_ok"),
                qualidade_confirmada: f.has("qualidade"),
                todos_insumos_confirmados: f.has("completo"),
                quantidade_confirmada: value(f, "quantidade"),
                alternativa_homologada: value(f, "alternativa"),
                prazo_recebimento_dias: number(f, "recebimento"),
                status: value(f, "status"),
              }),
            "Proposta salva. Nenhum pagamento foi realizado.",
          );
        }}
      >
        <div className="fields">
          <label>
            Casa
            <select value={unit} onChange={(e) => setUnit(e.target.value)}>
              {data.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fornecedor
            <select
              name="fornecedor"
              required
              defaultValue={old?.fornecedor_raiz ?? ""}
            >
              <option value="">Escolha</option>
              {roots.map(([r, n]) => (
                <option key={r} value={r}>
                  {n ?? r}
                </option>
              ))}
            </select>
          </label>
          <label>
            Pratos completos que voltam
            <select
              name="pratos"
              multiple
              required
              size={5}
              defaultValue={old?.pratos_liberados ?? []}
            >
              {data.pratos
                .filter(
                  (p) =>
                    p.unit_id === unit &&
                    data.fila.some(
                      (f) =>
                        f.produto_venda_ficha_id === p.id &&
                        f.causa_confirmada_em,
                    ),
                )
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome_venda_original}
                  </option>
                ))}
            </select>
          </label>
          {[
            ["entrada", "Entrada da dívida"],
            ["compra", "Compra nova"],
            ["frete", "Frete"],
          ].map(([n, l]) => (
            <label key={n}>
              {l} (R$)
              <input
                name={n}
                type="number"
                min="0"
                step="0.01"
                required
                defaultValue={
                  old?.[
                    (
                      {
                        entrada: "entrada_divida_rs",
                        compra: "compra_nova_rs",
                        frete: "frete_rs",
                      } as Record<string, string>
                    )[n!]!
                  ] ?? 0
                }
              />
            </label>
          ))}
          <label>
            Data de entrega
            <input
              type="date"
              name="entrega"
              defaultValue={old?.data_entrega ?? ""}
            />
          </label>
          <label>
            Quantidade e unidade confirmadas
            <input
              name="quantidade"
              defaultValue={old?.quantidade_confirmada ?? ""}
            />
          </label>
          <label>
            Alternativa homologada e evidência
            <input
              name="alternativa"
              defaultValue={old?.alternativa_homologada ?? ""}
            />
          </label>
          <label>
            Prazo para receber a venda (dias)
            <input
              type="number"
              min="0"
              max="365"
              name="recebimento"
              defaultValue={old?.prazo_recebimento_dias ?? 0}
            />
          </label>
          <label>
            Status
            <select name="status" defaultValue={old?.status ?? "rascunho"}>
              <option value="rascunho">Rascunho</option>
              <option value="em_negociacao">Em negociação</option>
              <option value="validado">Validado para análise</option>
              <option value="descartado">Descartado</option>
              <option value="concluido">Concluído</option>
            </select>
          </label>
        </div>
        <div className="checks">
          <label>
            <input
              type="checkbox"
              name="entrega_ok"
              defaultChecked={old?.entrega_confirmada}
            />
            Entrega confirmada
          </label>
          <label>
            <input
              type="checkbox"
              name="qualidade"
              defaultChecked={old?.qualidade_confirmada}
            />
            Qualidade confirmada
          </label>
          <label>
            <input
              type="checkbox"
              name="completo"
              defaultChecked={old?.todos_insumos_confirmados}
            />
            Todos os insumos para os pratos estão assegurados
          </label>
        </div>
        <button disabled={busy || !data.canEdit}>Salvar proposta</button>
      </form>
    </details>
  );
}
function Strategy({
  data,
  house,
}: {
  data: Data;
  house: (s: string) => string;
}) {
  const target = (key: string) =>
    data.targets.find((t) => t.indicador === key)?.meta;
  const latest = data.kpi.reduce((s, r) => (r.semana > s ? r.semana : s), "");
  const kpis = data.kpi.filter((r) => r.semana === latest);
  return (
    <>
      <section className="panel">
        <h2>As sete diretrizes</h2>
        <ol>
          <li>Caixa vai para acordos que devolvem pratos completos à venda.</li>
          <li>Todo 86 tem causa confirmada pela operação.</li>
          <li>
            Papel na marca e classificação econômica são decisões separadas.
          </li>
          <li>
            Concentrar itens padronizáveis; manter titular e reserva testada nos
            críticos.
          </li>
          <li>Alongar prazo sem comprar estoque acima do giro.</li>
          <li>Custo ou disponibilidade desconhecidos ficam “a validar”.</li>
          <li>Uma fila, um dono, próxima ação e prazo.</li>
        </ol>
      </section>
      <section className="panel">
        <h2>Regras para decidir</h2>
        <p>
          Qualidade bloqueia imediatamente, inclusive assinatura; o chef
          confirma a retomada. Retirada permanente de assinatura exige founder e
          chef distintos. Prato bloqueado não é penalizado por venda baixa
          durante o bloqueio.
        </p>
        <p>
          Acordos respondem: o que volta, quanto sai agora, quando chega e
          quanto de contribuição recupera em 7 e 14 dias. O ranking exige custo,
          entrega, qualidade e todos os insumos confirmados. Não equivale a
          autorização de pagamento.
        </p>
        <p>
          Compra com pedido é a regra. Compare preço utilizável, frete, mínimo,
          validade, prazo, crédito e confiabilidade. Fornecedor novo e
          alternativa passam por homologação.
        </p>
      </section>
      <section className="panel">
        <h2>Rotina de gestão</h2>
        <p>
          Diária, 15 min: bloqueios, risco de falta, caixa, entregas e
          retomadas. Semanal: indicadores, reincidências e acordos. Mensal:
          cardápio, repreço e testes de exposição.
        </p>
        <p>
          Operação e chef confirmam causa e retomada; Compras e Financeiro
          conciliam a liberação; Controladoria valida custos; founder e chefs
          decidem assinaturas.
        </p>
      </section>
      <section className="panel">
        <h2>Indicadores · semana de {latest}</h2>
        <p>
          Registros da semana; prazo contratual dos títulos emitidos na semana;
          pedido nas compras da semana; custo completo no mês correspondente.
          Vencido é a posição atual. Zero confirmado não significa ausência de
          ruptura.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Casa</th>
                <th>Registros / rupturas confirmadas</th>
                <th>Causa e dono · meta {pct(target("causa_dono_pct"))}</th>
                <th>
                  Retomada / assinatura · meta{" "}
                  {target("retomada_assinatura_horas") ?? "—"}h
                </th>
                <th>Prazo contratual</th>
                <th>Com pedido · meta {pct(target("com_pedido_pct"))}</th>
                <th>
                  Vencido de assinatura · meta{" "}
                  {money(target("vencido_assinatura"))}
                </th>
                <th>
                  Custo completo · meta {pct(target("cobertura_custo_pct"))}
                </th>
              </tr>
            </thead>
            <tbody>
              {kpis.map((k) => (
                <tr key={k.unit_id}>
                  <th>{house(k.unit_id)}</th>
                  <td>
                    {k.registros} / {k.produtos_ruptura}
                  </td>
                  <td>{pct(k.causa_dono_pct)}</td>
                  <td>
                    {k.retomada_horas == null
                      ? "Não medido"
                      : `${Number(k.retomada_horas).toFixed(1)}h`}{" "}
                    /{" "}
                    {k.retomada_assinatura_horas == null
                      ? "Não medido"
                      : `${Number(k.retomada_assinatura_horas).toFixed(1)}h`}
                  </td>
                  <td>
                    {k.prazo_dias == null
                      ? "Não medido"
                      : `${Number(k.prazo_dias).toFixed(1)} dias`}
                  </td>
                  <td>{pct(k.com_pedido_pct)}</td>
                  <td>{money(k.vencido_assinatura_atual)}</td>
                  <td>{pct(k.cobertura_custo_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>Decisões do founder</h2>
        <p>
          Teto:{" "}
          {data.config.teto_caixa_7d == null
            ? "pendente"
            : money(data.config.teto_caixa_7d)}{" "}
          · dono da fila: {data.config.dono_fila || "pendente"} · assinaturas
          cadastradas:{" "}
          {data.papeis.filter((p) => p.papel === "assinatura").length}.
        </p>
        <a href="/compras/abastecimento/acordos">Definir caixa e dono →</a>{" "}
        <a href="/compras/abastecimento/cardapio">
          Definir assinaturas com os chefs →
        </a>
      </section>
    </>
  );
}
