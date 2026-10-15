"use server";
import { z } from "zod";
import { comprasAccess } from "./everest-access";

export interface RelogioItemData {
  insumo_id: string;
  nome: string;
  unidade_medida: string | null;
  qtd_contada: number | null;
  contado_em: string | null;
  tendencia_sem: number | null;
  qtd_minima: number;
  qtd_maxima: number | null;
  lead_time_dias: number;
  fornecedor_preferencial_id: string | null;
  fornecedor_preferencial_nome: string | null;
  fornecedor_cnpj: string | null;
}

export async function getRelogioItem(
  unit_id: string,
  insumo_id: string,
): Promise<RelogioItemData | null> {
  const uid = z.string().uuid().parse(unit_id);
  const iid = z.string().uuid().parse(insumo_id);
  const { db } = await comprasAccess(uid);

  // 1. compras_estoque_minimo
  const minRow = await db
    .from("compras_estoque_minimo")
    .select("qtd_minima,qtd_maxima,fornecedor_preferencial_id")
    .eq("unit_id", uid)
    .eq("insumo_id", iid)
    .maybeSingle();
  if (minRow.error) throw new Error(minRow.error.message);
  const minimo = minRow.data as {
    qtd_minima: number;
    qtd_maxima: number | null;
    fornecedor_preferencial_id: string | null;
  } | null;

  // 2. item name + unit from everest_itens
  const itemRow = await db
    .from("everest_itens")
    .select("descricao,unidade_medida")
    .eq("id", iid)
    .maybeSingle();
  if (itemRow.error) throw new Error(itemRow.error.message);
  const itemData = itemRow.data as { descricao: string; unidade_medida: string | null } | null;

  // 3. tendencia_sem from mv_consumo_tendencia
  const tendRow = await db
    .from("mv_consumo_tendencia")
    .select("tendencia_sem")
    .eq("unit_id", uid)
    .eq("insumo_id", iid)
    .maybeSingle();
  if (tendRow.error) throw new Error(tendRow.error.message);
  const tendencia_sem: number | null = (tendRow.data as { tendencia_sem: number } | null)?.tendencia_sem ?? null;

  // 4. qtd_contada + contado_em from compras_contagem_rapida
  const contRow = await db
    .from("compras_contagem_rapida")
    .select("qtd,contado_em")
    .eq("unit_id", uid)
    .eq("insumo_id", iid)
    .maybeSingle();
  if (contRow.error) throw new Error(contRow.error.message);
  const contData = contRow.data as { qtd: number; contado_em: string } | null;

  // 5. fornecedor preferencial info + lead_time
  const prefId = minimo?.fornecedor_preferencial_id ?? null;
  let fornecedor_nome: string | null = null;
  let fornecedor_cnpj: string | null = null;
  let lead_time_dias = 3;

  if (prefId) {
    const fornRow = await db
      .from("everest_fornecedores")
      .select("nome_fantasia,razao_social,cpf_cnpj")
      .eq("id", prefId)
      .maybeSingle();
    if (fornRow.error) throw new Error(fornRow.error.message);
    const forn = fornRow.data as {
      nome_fantasia: string | null;
      razao_social: string | null;
      cpf_cnpj: string | null;
    } | null;
    fornecedor_nome = forn?.nome_fantasia || forn?.razao_social || null;
    fornecedor_cnpj = forn?.cpf_cnpj ?? null;

    if (fornecedor_cnpj) {
      const raiz = fornecedor_cnpj.replace(/\D/g, "").slice(0, 8);
      if (raiz.length === 8) {
        const ltRow = await db
          .from("compras_fornecedor_credito")
          .select("lead_time_dias")
          .eq("raiz_cnpj", raiz)
          .maybeSingle();
        if (ltRow.error) throw new Error(ltRow.error.message);
        lead_time_dias = (ltRow.data as { lead_time_dias: number } | null)?.lead_time_dias ?? 3;
      }
    }
  }

  return {
    insumo_id: iid,
    nome: itemData?.descricao ?? iid,
    unidade_medida: itemData?.unidade_medida ?? null,
    qtd_contada: contData?.qtd ?? null,
    contado_em: contData?.contado_em ?? null,
    tendencia_sem,
    qtd_minima: minimo?.qtd_minima ?? 0,
    qtd_maxima: minimo?.qtd_maxima ?? null,
    lead_time_dias,
    fornecedor_preferencial_id: prefId,
    fornecedor_preferencial_nome: fornecedor_nome,
    fornecedor_cnpj,
  };
}

export async function saveLeadTimeForItem(
  unit_id: string,
  fornecedor_cnpj: string,
  lead_time_dias: number,
): Promise<{ ok: boolean; error?: string }> {
  const uid = z.string().uuid().parse(unit_id);
  const raiz = fornecedor_cnpj.replace(/\D/g, "").slice(0, 8);
  if (raiz.length < 8) return { ok: false, error: "CNPJ inválido." };
  const d = Math.max(1, Math.min(90, Math.round(lead_time_dias)));
  const { db } = await comprasAccess(uid, "write");
  const { error } = await db
    .from("compras_fornecedor_credito")
    .upsert(
      { raiz_cnpj: raiz, lead_time_dias: d },
      { onConflict: "raiz_cnpj" },
    );
  if (error) return { ok: false, error: (error as { message: string }).message };
  return { ok: true };
}
