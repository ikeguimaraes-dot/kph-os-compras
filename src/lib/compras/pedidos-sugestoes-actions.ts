"use server";
import { z } from "zod";
import { comprasAccess } from "./everest-access";
import type { OrigemReposicao } from "./estoque-minmax-actions";

export interface SugestaoItem {
  insumo_id: string;
  nome: string;
  unidade_medida: string | null;
  estoque_atual: number | null;
  qtd_minima: number;
  qtd_maxima: number | null;
  origem_reposicao: OrigemReposicao;
  fornecedor_preferencial_id: string | null;
  fornecedor_preferencial_nome: string | null;
  compra_12m: number;
}

export interface SugestoesReposicao {
  comprar: SugestaoItem[];
  transferir_produzir: SugestaoItem[];
}

export async function getSugestoesReposicao(unit_id: string): Promise<SugestoesReposicao> {
  const uid = z.uuid().parse(unit_id);
  const { db } = await comprasAccess(uid);

  // Load all configured items with minima set, excluding bloqueado
  const minimoRows: {
    insumo_id: string;
    qtd_minima: number;
    qtd_maxima: number | null;
    origem_reposicao: OrigemReposicao;
    fornecedor_preferencial_id: string | null;
  }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await db
      .from("compras_estoque_minimo")
      .select("insumo_id,qtd_minima,qtd_maxima,origem_reposicao,fornecedor_preferencial_id")
      .eq("unit_id", uid)
      .gt("qtd_minima", 0)
      .neq("origem_reposicao", "bloqueado")
      .range(offset, offset + 999);
    if (r.error) throw new Error(r.error.message);
    minimoRows.push(
      ...(r.data as {
        insumo_id: string;
        qtd_minima: number;
        qtd_maxima: number | null;
        origem_reposicao: OrigemReposicao;
        fornecedor_preferencial_id: string | null;
      }[])
    );
    if (r.data.length < 1000) break;
  }

  if (minimoRows.length === 0) return { comprar: [], transferir_produzir: [] };

  const itemIds = minimoRows.map((m) => m.insumo_id);

  // Fetch names
  const catalogMap = new Map<string, { descricao: string; unidade_medida: string | null }>();
  for (let i = 0; i < itemIds.length; i += 100) {
    const r = await db
      .from("everest_itens")
      .select("id,descricao,unidade_medida")
      .in("id", itemIds.slice(i, i + 100));
    if (r.error) throw new Error(r.error.message);
    for (const row of r.data) {
      catalogMap.set(row.id, { descricao: row.descricao, unidade_medida: row.unidade_medida ?? null });
    }
  }

  // Fetch current stock
  const stockMap = new Map<string, number | null>();
  for (let offset = 0; ; offset += 1000) {
    const r = await db
      .from("v_pedido_estoque")
      .select("item_id,quantidade")
      .eq("unit_id", uid)
      .range(offset, offset + 999);
    if (r.error) throw new Error(r.error.message);
    for (const row of r.data) {
      if (row.item_id) stockMap.set(row.item_id, row.quantidade ?? null);
    }
    if (r.data.length < 1000) break;
  }

  // Fetch purchase totals (12m)
  const compraMap = new Map<string, number>();
  for (let offset = 0; ; offset += 1000) {
    const r = await db
      .from("v_mapa_compra")
      .select("item_id,vl_total")
      .eq("unit_id", uid)
      .not("item_id", "is", null)
      .range(offset, offset + 999);
    if (r.error) throw new Error(r.error.message);
    for (const row of r.data) {
      if (row.item_id) {
        compraMap.set(row.item_id, (compraMap.get(row.item_id) ?? 0) + (row.vl_total ?? 0));
      }
    }
    if (r.data.length < 1000) break;
  }

  // Fetch preferred supplier names
  const fornecedorIds = [
    ...new Set(
      minimoRows.map((m) => m.fornecedor_preferencial_id).filter((id): id is string => id != null)
    ),
  ];
  const fornecedorNomeMap = new Map<string, string>();
  for (let i = 0; i < fornecedorIds.length; i += 100) {
    const r = await db
      .from("everest_fornecedores")
      .select("id,nome_fantasia,razao_social")
      .in("id", fornecedorIds.slice(i, i + 100));
    if (r.error) throw new Error(r.error.message);
    for (const row of r.data as { id: string; nome_fantasia: string | null; razao_social: string | null }[]) {
      fornecedorNomeMap.set(row.id, row.nome_fantasia || row.razao_social || row.id);
    }
  }

  const comprar: SugestaoItem[] = [];
  const transferir_produzir: SugestaoItem[] = [];

  for (const m of minimoRows) {
    const catalog = catalogMap.get(m.insumo_id);
    if (!catalog) continue;
    const stock = stockMap.get(m.insumo_id) ?? null;
    // Only include items below minimum (or without known stock)
    if (stock != null && stock >= m.qtd_minima) continue;
    const fornId = m.fornecedor_preferencial_id;
    const item: SugestaoItem = {
      insumo_id: m.insumo_id,
      nome: catalog.descricao,
      unidade_medida: catalog.unidade_medida,
      estoque_atual: stock,
      qtd_minima: m.qtd_minima,
      qtd_maxima: m.qtd_maxima,
      origem_reposicao: m.origem_reposicao,
      fornecedor_preferencial_id: fornId,
      fornecedor_preferencial_nome: fornId ? (fornecedorNomeMap.get(fornId) ?? null) : null,
      compra_12m: compraMap.get(m.insumo_id) ?? 0,
    };
    if (m.origem_reposicao === "compra") {
      comprar.push(item);
    } else {
      transferir_produzir.push(item);
    }
  }

  comprar.sort((a, b) => b.compra_12m - a.compra_12m);
  transferir_produzir.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return { comprar, transferir_produzir };
}
