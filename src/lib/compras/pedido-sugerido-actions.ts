"use server";
import { z } from "zod";
import { comprasAccess } from "./everest-access";

export interface TendenciaItem {
  insumo_id: string;
  nome: string;
  unidade_medida: string | null;
  consumo_sem_compra: number;
  consumo_sem_teorico: number;
  tendencia_sem: number;
  variacao_pct: number | null;
  qtd_minima: number;
  qtd_maxima: number | null;
  // sugestao_sem = GREATEST(ceil(tendencia_sem), ceil(qtd_minima/4)), capped at ceil(qtd_maxima/4)
  sugestao_sem: number;
  estoque_contado: number | null;
  contado_em: string | null;
  fornecedor_id: string | null;
  fornecedor_nome: string;
}

export interface GrupoFornecedor {
  fornecedor_id: string | null;
  fornecedor_nome: string;
  itens: TendenciaItem[];
}

export interface PedidoSugerido {
  grupos: GrupoFornecedor[];
  ultimo_refresh: string | null;
}

function calcSugestao(tendencia_sem: number, qtd_minima: number, qtd_maxima: number | null): number {
  // sugestao_sem = GREATEST(ceil(tendencia), ceil(minimo/4)), capped at ceil(maximo/4) when set.
  // "proporcional": qtd_minima is a stock level; dividing by 4 converts it to a weekly reference.
  const sug = Math.max(Math.ceil(tendencia_sem), Math.ceil(qtd_minima / 4));
  if (qtd_maxima != null) return Math.min(sug, Math.ceil(qtd_maxima / 4));
  return sug;
}

export async function getPedidoSugeridoDoMes(unit_id: string): Promise<PedidoSugerido> {
  const uid = z.string().uuid().parse(unit_id);
  const { db } = await comprasAccess(uid);

  // 1. Fetch all tendência rows for this unit
  const tendRows: {
    insumo_id: string;
    consumo_sem_compra: number;
    consumo_sem_teorico: number;
    tendencia_sem: number;
    variacao_pct: number | null;
  }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await db
      .from("mv_consumo_tendencia")
      .select("insumo_id,consumo_sem_compra,consumo_sem_teorico,tendencia_sem,variacao_pct")
      .eq("unit_id", uid)
      .range(offset, offset + 999);
    if (r.error) throw new Error(r.error.message);
    tendRows.push(...(r.data as typeof tendRows));
    if (r.data.length < 1000) break;
  }

  if (tendRows.length === 0) return { grupos: [], ultimo_refresh: null };

  const allIds = tendRows.map((r) => r.insumo_id);

  // 2. Fetch compras_estoque_minimo restricted to origem_reposicao = 'compra'
  const minimoMap = new Map<
    string,
    { qtd_minima: number; qtd_maxima: number | null; fornecedor_preferencial_id: string | null }
  >();
  for (let i = 0; i < allIds.length; i += 100) {
    const r = await db
      .from("compras_estoque_minimo")
      .select("insumo_id,qtd_minima,qtd_maxima,fornecedor_preferencial_id,origem_reposicao")
      .eq("unit_id", uid)
      .eq("origem_reposicao", "compra")
      .gt("qtd_minima", 0)
      .in("insumo_id", allIds.slice(i, i + 100));
    if (r.error) throw new Error(r.error.message);
    for (const row of r.data as {
      insumo_id: string;
      qtd_minima: number;
      qtd_maxima: number | null;
      fornecedor_preferencial_id: string | null;
      origem_reposicao: string;
    }[]) {
      minimoMap.set(row.insumo_id, {
        qtd_minima: row.qtd_minima,
        qtd_maxima: row.qtd_maxima ?? null,
        fornecedor_preferencial_id: row.fornecedor_preferencial_id ?? null,
      });
    }
  }

  // Keep only items with origem_reposicao = 'compra'
  const filtered = tendRows.filter((r) => minimoMap.has(r.insumo_id));
  if (filtered.length === 0) return { grupos: [], ultimo_refresh: null };

  const filteredIds = filtered.map((r) => r.insumo_id);

  // 3. Fetch item names and units
  const catalogMap = new Map<string, { descricao: string; unidade_medida: string | null }>();
  for (let i = 0; i < filteredIds.length; i += 100) {
    const r = await db
      .from("everest_itens")
      .select("id,descricao,unidade_medida")
      .in("id", filteredIds.slice(i, i + 100));
    if (r.error) throw new Error(r.error.message);
    for (const row of r.data as { id: string; descricao: string; unidade_medida: string | null }[]) {
      catalogMap.set(row.id, { descricao: row.descricao, unidade_medida: row.unidade_medida ?? null });
    }
  }

  // 4. Fetch preferred supplier names (by everest_fornecedores.id)
  const preferredIds = [
    ...new Set(
      [...minimoMap.values()]
        .map((m) => m.fornecedor_preferencial_id)
        .filter((id): id is string => id != null)
    ),
  ];
  const preferredNomeMap = new Map<string, string>();
  for (let i = 0; i < preferredIds.length; i += 100) {
    const r = await db
      .from("everest_fornecedores")
      .select("id,nome_fantasia,razao_social")
      .in("id", preferredIds.slice(i, i + 100));
    if (r.error) throw new Error(r.error.message);
    for (const row of r.data as { id: string; nome_fantasia: string | null; razao_social: string | null }[]) {
      preferredNomeMap.set(row.id, row.nome_fantasia || row.razao_social || row.id);
    }
  }

  // 5. Fetch fallback supplier (principal_12m from v_mapa_insumo) for items without preferred
  const noPreferredIds = filteredIds.filter(
    (id) => !minimoMap.get(id)?.fornecedor_preferencial_id
  );
  const fallbackCnpjMap = new Map<string, string>(); // insumo_id → raiz_cnpj
  if (noPreferredIds.length > 0) {
    for (let i = 0; i < noPreferredIds.length; i += 100) {
      const r = await db
        .from("v_mapa_insumo")
        .select("item_id,principal_12m")
        .eq("unit_id", uid)
        .not("principal_12m", "is", null)
        .in("item_id", noPreferredIds.slice(i, i + 100));
      if (r.error) throw new Error(r.error.message);
      for (const row of r.data as { item_id: string; principal_12m: string | null }[]) {
        if (row.principal_12m) fallbackCnpjMap.set(row.item_id, row.principal_12m);
      }
    }
  }

  // Fetch apelidos for fallback raiz_cnpjs
  const fallbackNomeMap = new Map<string, string>(); // raiz_cnpj → display name
  const allFallbackCnpjs = [...new Set(fallbackCnpjMap.values())];
  for (let i = 0; i < allFallbackCnpjs.length; i += 100) {
    const r = await db
      .from("compras_fornecedor_apelido")
      .select("raiz_cnpj,apelido")
      .in("raiz_cnpj", allFallbackCnpjs.slice(i, i + 100));
    if (r.error) throw new Error(r.error.message);
    for (const row of r.data as { raiz_cnpj: string; apelido: string }[]) {
      fallbackNomeMap.set(row.raiz_cnpj, row.apelido);
    }
  }

  // 6. Fetch persisted stock counts
  const contagemMap = new Map<string, { qtd: number; contado_em: string }>();
  for (let i = 0; i < filteredIds.length; i += 100) {
    const r = await db
      .from("compras_contagem_rapida")
      .select("insumo_id,qtd,contado_em")
      .eq("unit_id", uid)
      .in("insumo_id", filteredIds.slice(i, i + 100));
    if (r.error) throw new Error(r.error.message);
    for (const row of r.data as { insumo_id: string; qtd: number; contado_em: string }[]) {
      contagemMap.set(row.insumo_id, { qtd: row.qtd, contado_em: row.contado_em });
    }
  }

  // 7. Last refresh timestamp from prisma_refresh_log
  const refreshRow = await db
    .from("prisma_refresh_log")
    .select("concluido_em")
    .eq("etapa", "consumo_tendencia")
    .not("concluido_em", "is", null)
    .is("erro", null)
    .order("iniciado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ultimo_refresh: string | null = (refreshRow.data as { concluido_em: string } | null)?.concluido_em ?? null;

  // 8. Build items grouped by supplier
  // Key: "preferred:{id}" | "fallback:{raiz_cnpj}" | "__sem__"
  const grupoMap = new Map<string, GrupoFornecedor>();

  for (const row of filtered) {
    const catalog = catalogMap.get(row.insumo_id);
    if (!catalog) continue;

    const minimo = minimoMap.get(row.insumo_id)!;
    const tendencia = row.tendencia_sem ?? 0;
    const sugestao_sem = calcSugestao(tendencia, minimo.qtd_minima, minimo.qtd_maxima);
    const contagem = contagemMap.get(row.insumo_id) ?? null;

    const prefId = minimo.fornecedor_preferencial_id;
    let fornecedor_id: string | null = null;
    let fornecedor_nome = "Sem fornecedor preferencial";
    let groupKey = "__sem__";

    if (prefId) {
      fornecedor_id = prefId;
      fornecedor_nome = preferredNomeMap.get(prefId) ?? prefId;
      groupKey = `preferred:${prefId}`;
    } else {
      const raiz = fallbackCnpjMap.get(row.insumo_id);
      if (raiz) {
        groupKey = `fallback:${raiz}`;
        fornecedor_nome = fallbackNomeMap.get(raiz) ?? raiz;
      }
    }

    if (!grupoMap.has(groupKey)) {
      grupoMap.set(groupKey, { fornecedor_id, fornecedor_nome, itens: [] });
    }

    grupoMap.get(groupKey)!.itens.push({
      insumo_id: row.insumo_id,
      nome: catalog.descricao,
      unidade_medida: catalog.unidade_medida,
      consumo_sem_compra: row.consumo_sem_compra ?? 0,
      consumo_sem_teorico: row.consumo_sem_teorico ?? 0,
      tendencia_sem: tendencia,
      variacao_pct: row.variacao_pct ?? null,
      qtd_minima: minimo.qtd_minima,
      qtd_maxima: minimo.qtd_maxima ?? null,
      sugestao_sem,
      estoque_contado: contagem?.qtd ?? null,
      contado_em: contagem?.contado_em ?? null,
      fornecedor_id,
      fornecedor_nome,
    });
  }

  // Sort items within each group by tendencia_sem desc
  const grupos = [...grupoMap.values()];
  for (const g of grupos) {
    g.itens.sort((a, b) => b.tendencia_sem - a.tendencia_sem);
  }

  // Sort groups: preferred first (by name), fallback next, sem-fornecedor last
  grupos.sort((a, b) => {
    const aKey = [...grupoMap.entries()].find(([, v]) => v === a)?.[0] ?? "";
    const bKey = [...grupoMap.entries()].find(([, v]) => v === b)?.[0] ?? "";
    const aOrder = aKey.startsWith("preferred") ? 0 : aKey.startsWith("fallback") ? 1 : 2;
    const bOrder = bKey.startsWith("preferred") ? 0 : bKey.startsWith("fallback") ? 1 : 2;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.fornecedor_nome.localeCompare(b.fornecedor_nome, "pt-BR");
  });

  return { grupos, ultimo_refresh };
}

export async function upsertContagemRapida(
  unit_id: string,
  insumo_id: string,
  qtd: number
): Promise<void> {
  const uid = z.string().uuid().parse(unit_id);
  const iid = z.string().uuid().parse(insumo_id);
  const qty = z.number().min(0).parse(qtd);
  const { db } = await comprasAccess(uid);
  const { error } = await db.from("compras_contagem_rapida").upsert(
    { unit_id: uid, insumo_id: iid, qtd: qty, contado_em: new Date().toISOString() },
    { onConflict: "unit_id,insumo_id" }
  );
  if (error) throw new Error(error.message);
}
