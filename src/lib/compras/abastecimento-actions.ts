"use server";
import { z } from "zod";
import { comprasAccess } from "./everest-access";
import {
  CAUSAS,
  TIPOS,
  STATUS,
  DISTRIBUIDORES,
  rankAgreements,
  type Agreement,
  type Contribution,
} from "./abastecimento-engine";
import type { SupabaseClient } from "@supabase/supabase-js";
const day = z.iso.date();
const text = z.string().trim().min(1).max(500);
function role(
  user: Awaited<ReturnType<typeof comprasAccess>>["user"],
  roles: string[],
  unit: string | null,
) {
  return user.roles.some(
    (r) =>
      roles.includes(r.role.toLowerCase()) &&
      (r.unitId === null || r.unitId === unit),
  );
}
async function writeAccess(
  unit: string | null,
  roles = [
    "founder",
    "diretoria",
    "diretor",
    "chef",
    "chefe de cozinha",
    "gm",
    "gerente geral",
    "operacional",
    "head_operacao",
    "comprador",
    "cfo",
    "head_financeiro",
  ],
) {
  const a = await comprasAccess(unit);
  if (!role(a.user, roles, unit))
    throw new Error("Seu perfil não pode alterar este registro.");
  return a;
}
async function readAll(
  db: SupabaseClient,
  table: string,
  ids: string[],
  order = "id",
) {
  const rows: Record<string, any>[] = [];
  for (let start = 0; ; start += 1000) {
    const r = await db
      .from(table)
      .select("*")
      .in("unit_id", ids)
      .order(order)
      .range(start, start + 999);
    if (r.error) throw new Error(r.error.message);
    rows.push(...r.data);
    if (r.data.length < 1000) return rows;
  }
}
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export async function getSupply(unit: string | null, mode: string = "rotina") {
  z.enum(["rotina", "acordos", "cardapio", "estrategia"]).parse(mode);
  const { db, units, unitIds, user } = await comprasAccess(unit);
  const [
    fila,
    acordos,
    pratos,
    papeis,
    titulos,
    kpi,
    config,
    contribution,
    approvals,
    targets,
  ] = await Promise.all([
    readAll(db, "v_abastecimento_fila", unitIds),
    readAll(db, "abastecimento_acordo", unitIds),
    readAll(db, "produto_venda_ficha", unitIds),
    readAll(db, "cardapio_papel", unitIds, "produto_venda_ficha_id"),
    readAll(db, "v_abastecimento_titulos", unitIds),
    mode === "estrategia"
      ? readAll(db, "v_abastecimento_kpi", unitIds, "semana")
      : Promise.resolve([]),
    db.from("abastecimento_config").select("*").single(),
    mode === "acordos"
      ? readAll(
          db,
          "v_abastecimento_contribuicao",
          unitIds,
          "produto_venda_ficha_id",
        )
      : Promise.resolve([]),
    db
      .from("cardapio_retirada_aprovacao")
      .select(
        "produto_venda_ficha_id,papel_aprovador,aprovado_em,solicitacao_em",
      )
      .limit(1000),
    db.from("abastecimento_metas").select("*"),
  ]);
  if (targets.error) throw new Error(targets.error.message);
  if (config.error || approvals.error)
    throw new Error(config.error?.message ?? approvals.error?.message);
  const visible = new Set(pratos.map((p) => p.id));
  const supplierRoots = new Set(
    fila
      .filter((r) => !["retomado", "planejado"].includes(r.status))
      .map((r) => r.fornecedor_raiz ?? r.sugestao_fornecedor_raiz),
  );
  const budgetCurrent =
    config.data.inicio &&
    today() >= config.data.inicio &&
    Date.parse(today()) < Date.parse(config.data.inicio) + 7 * 86400000;
  const budget =
    budgetCurrent && config.data.teto_caixa_7d !== null
      ? Number(config.data.teto_caixa_7d)
      : null;
  // A group-wide cash ceiling must be allocated across all authorized group agreements, not independently per house.
  const fullAccess = role(
    user,
    ["founder", "diretoria", "diretor", "cfo", "head_financeiro"],
    null,
  );
  const rank = rankAgreements(
    acordos as Agreement[],
    contribution as Contribution[],
    new Set(
      papeis
        .filter((p) => p.papel === "assinatura")
        .map((p) => p.produto_venda_ficha_id),
    ),
    unit === null && fullAccess ? budget : null,
    Number(config.data.fator_migracao),
    today(),
  );
  return {
    units,
    fila,
    targets: targets.data ?? [],
    acordos: rank,
    rawAgreements: acordos,
    pratos,
    papeis,
    titulos: titulos.filter((t) => supplierRoots.has(t.fornecedor_raiz)),
    kpi,
    config: config.data,
    budgetCurrent,
    approvals: (approvals.data ?? []).filter((a) =>
      visible.has(a.produto_venda_ficha_id),
    ),
    canEdit: role(
      user,
      [
        "founder",
        "diretoria",
        "diretor",
        "chef",
        "chefe de cozinha",
        "gm",
        "gerente geral",
        "operacional",
        "head_operacao",
        "comprador",
        "cfo",
        "head_financeiro",
      ],
      unit,
    ),
    founder: role(user, ["founder"], null),
    today: today(),
  };
}
export async function saveSupply(raw: unknown) {
  const v = z
    .object({
      id: z.uuid(),
      unit_id: z.uuid(),
      version: text,
      produto_venda_ficha_id: z.uuid(),
      tipo: z.enum(TIPOS),
      causa: z.enum(CAUSAS),
      insumo_id: z.uuid().nullable(),
      fornecedor_raiz: z.string().max(120).nullable(),
      responsavel: text,
      proxima_acao: text,
      prazo: day,
      previsao_retorno: day,
      status: z.enum(STATUS),
      inicio_confirmado_em: z.iso.datetime({ offset: true }).nullable(),
    })
    .parse(raw);
  const { db, user } = await writeAccess(v.unit_id);
  const b = await db
    .from("produto_venda_ficha")
    .select("id")
    .eq("unit_id", v.unit_id)
    .eq("id", v.produto_venda_ficha_id)
    .single();
  if (b.error) throw new Error("Prato fora desta casa.");
  if (v.tipo === "ruptura" && (!v.insumo_id || !v.fornecedor_raiz))
    throw new Error("Confirme o insumo e o fornecedor da ruptura.");
  if (v.fornecedor_raiz) {
    const vendor = await db
      .from("mv_prisma_compra_mes")
      .select("raiz_cnpj")
      .eq("unit_id", v.unit_id)
      .eq("raiz_cnpj", v.fornecedor_raiz)
      .limit(1);
    if (vendor.error || !vendor.data?.length)
      throw new Error(
        "Fornecedor sem histórico nesta casa; validar cadastro antes.",
      );
  }
  if (v.insumo_id) {
    const item = await db
      .from("everest_itens")
      .select("id")
      .eq("id", v.insumo_id)
      .single();
    if (item.error) throw new Error("Insumo inválido.");
  }
  if (v.status === "retomado")
    throw new Error(
      "Use a confirmação de retomada da cozinha; a venda no PDV é conferida separadamente.",
    );
  if (v.tipo === "planejado") {
    const p = await db
      .from("cardapio_papel")
      .select("papel,retirada_aprovada_em")
      .eq("produto_venda_ficha_id", v.produto_venda_ficha_id)
      .maybeSingle();
    if (p.error) throw new Error(p.error.message);
    if (p.data?.papel === "assinatura" && !p.data.retirada_aprovada_em)
      throw new Error(
        "Assinatura exige aprovação de founder e chef antes de retirada planejada.",
      );
  }
  const { id, version, inicio_confirmado_em, ...rest } = v;
  const fields = {
    ...rest,
    ...(inicio_confirmado_em ? { inicio_confirmado_em } : {}),
  };
  const now = new Date().toISOString();
  const r = await db
    .from("abastecimento_86")
    .update({
      ...fields,
      causa_confirmada_por: user.id,
      causa_confirmada_em: now,
      atualizado_em: now,
    })
    .eq("id", id)
    .eq("unit_id", v.unit_id)
    .eq("atualizado_em", version)
    .select("id");
  if (r.error) throw new Error(r.error.message);
  if (!r.data?.length)
    throw new Error("Registro mudou. Recarregue antes de salvar.");
}
export async function confirmKitchen(raw: unknown) {
  const v = z
    .object({ id: z.uuid(), unit: z.uuid(), version: text })
    .parse(raw);
  const { db, user } = await writeAccess(v.unit);
  const old = await db
    .from("abastecimento_86")
    .select("*")
    .eq("id", v.id)
    .eq("unit_id", v.unit)
    .single();
  if (old.error || !old.data) throw new Error("Registro não encontrado.");
  if (!old.data.causa_confirmada_em)
    throw new Error("Confirme causa, prato, dono e ação antes da retomada.");
  if (
    (old.data.tipo === "qualidade" ||
      old.data.causa === "qualidade_reprovada") &&
    !role(user, ["chef", "chefe de cozinha"], v.unit)
  )
    throw new Error("O chef da casa precisa liberar a qualidade.");
  const now = new Date().toISOString();
  const r = await db
    .from("abastecimento_86")
    .update({
      retomada_cozinha_em: now,
      retomada_cozinha_por: user.id,
      status: old.data.retomada_pdv_em ? "retomado" : old.data.status,
      atualizado_em: now,
    })
    .eq("id", v.id)
    .eq("unit_id", v.unit)
    .eq("atualizado_em", v.version)
    .select("id");
  if (r.error) throw new Error(r.error.message);
  if (!r.data?.length) throw new Error("Registro alterado por outra pessoa.");
}
export async function saveSupplyConfig(raw: unknown) {
  const v = z
    .object({
      teto_caixa_7d: z.number().min(0).max(1e10).nullable(),
      inicio: day.nullable(),
      fator_migracao: z.number().min(0).max(1),
      dono_fila: z.string().trim().max(120).nullable(),
    })
    .parse(raw);
  const { db, user } = await writeAccess(null, ["founder"]);
  if (v.teto_caixa_7d !== null && !v.inicio)
    throw new Error("Informe o início da janela de sete dias.");
  const r = await db
    .from("abastecimento_config")
    .update({
      ...v,
      atualizado_por: user.id,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", true);
  if (r.error) throw new Error(r.error.message);
}
export async function saveAgreement(raw: unknown) {
  const v = z
    .object({
      id: z.uuid().optional(),
      version: z.string().optional(),
      unit_id: z.uuid(),
      fornecedor_raiz: text,
      pratos_liberados: z.array(z.uuid()).min(1).max(100),
      entrada_divida_rs: z.number().min(0).max(1e9),
      compra_nova_rs: z.number().min(0).max(1e9),
      frete_rs: z.number().min(0).max(1e9),
      data_entrega: day.nullable(),
      entrega_confirmada: z.boolean(),
      qualidade_confirmada: z.boolean(),
      todos_insumos_confirmados: z.boolean(),
      quantidade_confirmada: z.string().max(500),
      alternativa_homologada: z.string().max(500),
      prazo_recebimento_dias: z.number().int().min(0).max(365),
      status: z.enum([
        "rascunho",
        "em_negociacao",
        "validado",
        "descartado",
        "concluido",
      ]),
    })
    .parse(raw);
  const { db, user } = await writeAccess(v.unit_id, [
    "founder",
    "diretoria",
    "diretor",
    "cfo",
    "head_financeiro",
    "comprador",
  ]);
  const pratos = await db
    .from("produto_venda_ficha")
    .select("id")
    .eq("unit_id", v.unit_id)
    .in("id", v.pratos_liberados);
  if (pratos.error || pratos.data?.length !== new Set(v.pratos_liberados).size)
    throw new Error("Todos os pratos precisam pertencer à casa.");
  const supplier = await db
    .from("mv_prisma_compra_mes")
    .select("raiz_cnpj")
    .eq("unit_id", v.unit_id)
    .eq("raiz_cnpj", v.fornecedor_raiz)
    .limit(1);
  if (supplier.error || !supplier.data?.length)
    throw new Error("Fornecedor fora da casa.");
  const queue = await db
    .from("abastecimento_86")
    .select("produto_venda_ficha_id,causa_confirmada_em")
    .eq("unit_id", v.unit_id)
    .in("produto_venda_ficha_id", v.pratos_liberados)
    .not("status", "in", "(retomado,planejado)");
  if (queue.error) throw new Error(queue.error.message);
  if (
    v.status === "validado" &&
    (!v.data_entrega ||
      !v.entrega_confirmada ||
      !v.qualidade_confirmada ||
      !v.todos_insumos_confirmados ||
      !v.quantidade_confirmada.trim() ||
      v.pratos_liberados.some(
        (id) =>
          !queue.data?.some(
            (q) => q.produto_venda_ficha_id === id && q.causa_confirmada_em,
          ),
      ))
  )
    throw new Error(
      "Valide causa de cada prato, quantidade, todos os insumos, entrega e qualidade.",
    );
  const contributions = await db
    .from("v_abastecimento_contribuicao")
    .select("*")
    .eq("unit_id", v.unit_id)
    .in("produto_venda_ficha_id", v.pratos_liberados);
  const config = await db
    .from("abastecimento_config")
    .select("fator_migracao")
    .single();
  if (contributions.error || config.error)
    throw new Error("Não foi possível calcular a contribuição.");
  const estimation = rankAgreements(
    [
      {
        ...v,
        id: v.id ?? "draft",
        desembolso_total_rs:
          v.entrada_divida_rs + v.compra_nova_rs + v.frete_rs,
      },
    ],
    contributions.data as Contribution[],
    new Set(),
    null,
    Number(config.data.fator_migracao),
    today(),
  )[0];
  const { id, version, ...fields } = v;
  const payload = {
    ...fields,
    contribuicao_recuperavel_7d: estimation?.c7 ?? null,
    contribuicao_recuperavel_14d: estimation?.c14 ?? null,
    atualizado_em: new Date().toISOString(),
  };
  const r = id
    ? await db
        .from("abastecimento_acordo")
        .update(payload)
        .eq("id", id)
        .eq("unit_id", v.unit_id)
        .eq("atualizado_em", version ?? "")
        .select("id")
    : await db
        .from("abastecimento_acordo")
        .insert({ ...payload, criado_por: user.id })
        .select("id");
  if (r.error) throw new Error(r.error.message);
  if (!r.data?.length) throw new Error("Acordo mudou; recarregue.");
}
export async function saveDishRole(raw: unknown) {
  const v = z
    .object({
      unit: z.uuid(),
      prato: z.uuid(),
      papel: z.enum(["assinatura", "nucleo", "complemento"]),
    })
    .parse(raw);
  const { db, user } = await writeAccess(v.unit, [
    "founder",
    "chef",
    "chefe de cozinha",
  ]);
  const dish = await db
    .from("produto_venda_ficha")
    .select("id")
    .eq("unit_id", v.unit)
    .eq("id", v.prato)
    .single();
  if (dish.error) throw new Error("Prato fora da casa.");
  const old = await db
    .from("cardapio_papel")
    .select("*")
    .eq("produto_venda_ficha_id", v.prato)
    .maybeSingle();
  if (old.error) throw new Error(old.error.message);
  if (old.data?.papel === "assinatura" && v.papel !== "assinatura")
    throw new Error(
      "Solicite retirada e obtenha duas aprovações. Uma edição não pode remover assinatura.",
    );
  const r = await db
    .from("cardapio_papel")
    .upsert({
      unit_id: v.unit,
      produto_venda_ficha_id: v.prato,
      papel: v.papel,
      aprovado_por: user.id,
      aprovado_em: new Date().toISOString(),
    });
  if (r.error) throw new Error(r.error.message);
}
export async function requestDishRemoval(raw: unknown) {
  const v = z
    .object({ unit: z.uuid(), prato: z.uuid(), motivo: text })
    .parse(raw);
  const { db } = await writeAccess(v.unit, [
    "founder",
    "chef",
    "chefe de cozinha",
  ]);
  const r = await db
    .from("cardapio_papel")
    .update({
      retirada_solicitada_em: new Date().toISOString(),
      retirada_aprovada_em: null,
      retirada_motivo: v.motivo,
    })
    .eq("unit_id", v.unit)
    .eq("produto_venda_ficha_id", v.prato)
    .eq("papel", "assinatura")
    .is("retirada_solicitada_em", null)
    .select("produto_venda_ficha_id");
  if (r.error) throw new Error(r.error.message);
  if (!r.data?.length)
    throw new Error("Já há solicitação, ou o prato não é assinatura.");
}
export async function approveDishRemoval(raw: unknown) {
  const v = z
    .object({
      unit: z.uuid(),
      prato: z.uuid(),
      solicitacao: z.iso.datetime({ offset: true }),
    })
    .parse(raw);
  const { db, user } = await writeAccess(v.unit, [
    "founder",
    "chef",
    "chefe de cozinha",
  ]);
  const p = await db
    .from("cardapio_papel")
    .select("unit_id")
    .eq("produto_venda_ficha_id", v.prato)
    .eq("unit_id", v.unit)
    .single();
  if (p.error) throw new Error("Prato fora da casa.");
  const r = await db.rpc("aprovar_retirada_assinatura", {
    p_prato: v.prato,
    p_user: user.id,
    p_solicitacao: v.solicitacao,
  });
  if (r.error) throw new Error(r.error.message);
}
export async function getBrandMatrix(search = "") {
  const { db, user } = await comprasAccess();
  let q = db.from("compras_matriz_marcas").select("*").order("produto");
  if (search.trim()) q = q.ilike("produto", `%${search.trim().slice(0, 100)}%`);
  const [items, quotes, total, linked] = await Promise.all([
    q.limit(500),
    db
      .from("compras_cotacao_distribuidor")
      .select("*")
      .order("matriz_id")
      .order("distribuidor")
      .limit(2500),
    db
      .from("compras_matriz_marcas")
      .select("id", { count: "exact", head: true }),
    db
      .from("compras_matriz_marcas")
      .select("id", { count: "exact", head: true })
      .not("item_id", "is", null),
  ]);
  for (const r of [items, quotes, total, linked])
    if (r.error) throw new Error(r.error.message);
  return {
    items: items.data ?? [],
    quotes: quotes.data ?? [],
    total: total.count ?? 0,
    linked: linked.count ?? 0,
    canEdit: role(user, ["founder", "comprador", "diretoria", "diretor"], null),
  };
}
export async function searchSupplyItems(term: string) {
  const { db } = await comprasAccess();
  const r = await db
    .from("everest_itens")
    .select("id,descricao")
    .ilike("descricao", `%${term.trim().slice(0, 100)}%`)
    .order("descricao")
    .limit(40);
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
export async function linkMatrixItem(raw: unknown) {
  const v = z.object({ id: z.uuid(), item: z.uuid() }).parse(raw);
  const { db, user } = await writeAccess(null, [
    "founder",
    "comprador",
    "diretoria",
    "diretor",
  ]);
  const r = await db
    .from("compras_matriz_marcas")
    .update({
      item_id: v.item,
      ligacao_origem: "manual",
      ligado_por: user.id,
      ligado_em: new Date().toISOString(),
    })
    .eq("id", v.id);
  if (r.error) throw new Error(r.error.message);
}
export async function saveQuote(raw: unknown) {
  const n = z.number().min(0).max(1e10).nullable();
  const v = z
    .object({
      matriz_id: z.uuid(),
      distribuidor: z.enum(DISTRIBUIDORES),
      preco: z.number().positive().nullable(),
      quantidade_utilizavel: z.number().positive().nullable(),
      marca: z.string().max(120),
      frete: n,
      pedido_minimo: n,
      validade: day.nullable(),
      prazo_dias: z.number().int().min(0).nullable(),
      credito_disponivel: n,
      confiabilidade_pct: z.number().min(0).max(100).nullable(),
      homologado: z.boolean(),
      observacao: z.string().max(500),
    })
    .parse(raw);
  const { db, user } = await writeAccess(null, [
    "founder",
    "comprador",
    "diretoria",
    "diretor",
  ]);
  if (v.homologado && (!v.marca.trim() || !v.quantidade_utilizavel || !v.preco))
    throw new Error(
      "Homologação requer marca, preço e quantidade utilizável conferidos.",
    );
  const r = await db
    .from("compras_cotacao_distribuidor")
    .upsert(
      {
        ...v,
        atualizado_por: user.id,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "matriz_id,distribuidor" },
    );
  if (r.error) throw new Error(r.error.message);
}
