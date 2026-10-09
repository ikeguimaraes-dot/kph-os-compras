"use server";
import { comprasAccess } from "./everest-access";
import { z } from "zod";
import { revalidatePath } from "next/cache";
export type SourceKind =
  | "fornecedores"
  | "ingredientes"
  | "cardapio"
  | "recebimento"
  | "estoque"
  | "analise";
export type SourceRow = {
  id: string;
  [key: string]: string | number | boolean | null;
};
const views = {
  fornecedores: "v_compras_fornecedores",
  ingredientes: "v_compras_ingredientes",
  cardapio: "v_compras_cardapio",
  recebimento: "v_compras_notas",
  estoque: "v_compras_inventarios",
  analise: "v_compras_notas_resumo",
} as const;
export async function getSource(
  kind: SourceKind,
  unit: string | null,
  search = "",
  month = "",
  page = 0,
) {
  if (!(kind in views)) throw new Error("Fonte inválida.");
  const { db, unitIds } = await comprasAccess(unit);
  z.number().int().min(0).max(10000).parse(page);
  let q = db
    .from(views[kind])
    .select("*", { count: "exact" })
    .in("unit_id", unitIds);
  if (search.trim() && kind !== "analise")
    q = q.ilike("nome", `%${search.trim().slice(0, 100)}%`);
  if (month) {
    z.string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .parse(month);
    const start = month + "-01";
    const end = new Date(
      Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1),
    )
      .toISOString()
      .slice(0, 10);
    if (kind === "recebimento" || kind === "estoque")
      q = q.gte("data", start).lt("data", end);
    if (kind === "analise") q = q.eq("mes", start);
  }
  q =
    kind === "analise"
      ? q.order("mes", { ascending: false })
      : kind === "recebimento" || kind === "estoque"
        ? q.order("data", { ascending: false }).order("id")
        : q.order("nome").order("id");
  const { data, error, count } = await q.order("unit_id").range(page * 50, page * 50 + 49);
  if (error) throw new Error(error.message);
  let totals: { notas: number; total: number } | null = null;
  if (kind === "recebimento" || kind === "analise") {
    let summary = db
      .from("v_compras_notas_resumo")
      .select("notas,total")
      .in("unit_id", unitIds);
    if (month) summary = summary.eq("mes", month + "-01");
    const result = await summary;
    if (result.error) throw new Error(result.error.message);
    totals = {
      notas: (result.data ?? []).reduce((s, r) => s + Number(r.notas), 0),
      total:
        (result.data ?? []).reduce(
          (s, r) => s + Math.round(Number(r.total) * 100),
          0,
        ) / 100,
    };
  }
  return {
    rows: (data ?? []).map((r) => ({ ...r, id: r.id ?? r.mes })) as SourceRow[],
    count: count ?? 0,
    totals,
  };
}
export async function getSourceDetail(
  kind: SourceKind,
  unit: string,
  id: string,
) {
  const { db } = await comprasAccess(unit);
  z.uuid().parse(id);
  if (kind === "cardapio") {
    const parent = await db
      .from("v_compras_cardapio")
      .select("*")
      .eq("unit_id", unit)
      .eq("id", id)
      .single();
    if (parent.error) throw new Error("Ficha não localizada nesta casa.");
    const result = await db
      .from("everest_fichas_tecnicas_itens")
      .select(
        "id,qt_aplicada,pr_aproveitamento,insumo_id,everest_itens!insumo_id(descricao,unidade_medida)",
      )
      .eq("ficha_id", id)
      .order("sequencia");
    if (result.error) throw new Error(result.error.message);
    return {
      parent: parent.data as SourceRow,
      rows: (result.data ?? []).map((r) => {
        const i = r.everest_itens as unknown as {
          descricao: string;
          unidade_medida: string;
        } | null;
        return {
          id: r.id,
          nome: i?.descricao ?? "Sem vínculo",
          unidade: i?.unidade_medida ?? "",
          quantidade: r.qt_aplicada,
          aproveitamento: r.pr_aproveitamento,
        };
      }) as SourceRow[],
    };
  }
  if (kind === "ingredientes") {
    const result = await db
      .from("everest_itens_custo_historico")
      .select("id,ano,mes,vl_custo_medio,qt_saldo,snapshot_em")
      .eq("unit_id", unit)
      .eq("item_id", id)
      .order("ano", { ascending: false })
      .order("mes", { ascending: false })
      .limit(100);
    if (result.error) throw new Error(result.error.message);
    return { parent: null, rows: result.data as SourceRow[] };
  }
  if (kind === "recebimento") {
    const p = await db
      .from("everest_notas_recebidas")
      .select("id")
      .eq("id", id)
      .eq("unit_id", unit)
      .single();
    if (p.error) throw new Error("Nota não autorizada.");
    const r = await db
      .from("everest_notas_recebidas_itens")
      .select(
        "id,vl_total,vl_unitario,qt_embalagem,nr_pedido,entra_cmv_cfop,everest_itens!item_id(descricao)",
      )
      .eq("nota_id", id)
      .order("id");
    if (r.error) throw new Error(r.error.message);
    return {
      parent: null,
      rows: (r.data ?? []).map((i) => ({
        ...i,
        nome:
          (i.everest_itens as unknown as { descricao: string } | null)
            ?.descricao ?? "Item sem vínculo",
        everest_itens: undefined,
      })) as unknown as SourceRow[],
    };
  }
  if (kind === "estoque") {
    const p = await db
      .from("everest_inventarios")
      .select("id")
      .eq("id", id)
      .eq("unit_id", unit)
      .single();
    if (p.error) throw new Error("Inventário não autorizado.");
    const rows: SourceRow[] = [];
    for (let offset = 0; ; offset += 500) {
      const r = await db
        .from("everest_inventario_itens")
        .select(
          "id,descricao_item,unidade_medida,quantidade_contada,quantidade_convertida,saldo_api,custo_api",
        )
        .eq("inventario_id", id)
        .order("id")
        .range(offset, offset + 499);
      if (r.error) throw new Error(r.error.message);
      rows.push(...(r.data as SourceRow[]));
      if (r.data.length < 500) break;
    }
    return { parent: null, rows };
  }
  return { parent: null, rows: [] as SourceRow[] };
}
export async function saveMenuMetadata(
  unit: string,
  id: string,
  price: number,
  category: string,
) {
  const { db } = await comprasAccess(unit);
  z.uuid().parse(id);
  z.number().finite().min(0).max(100000).parse(price);
  z.string().trim().min(1).max(100).parse(category);
  const result = await db
    .from("menu_items")
    .update({ preco_venda: price, categoria: category.trim() })
    .eq("id", id)
    .eq("unit_id", unit)
    .select("id");
  if (result.error || !result.data?.length)
    throw new Error("Não foi possível salvar preço e categoria.");
  revalidatePath("/cardapio");
}
