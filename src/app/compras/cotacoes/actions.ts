"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@kph/db/supabase/server";
import type { ActionResult } from "@/lib/result";
import type { PriceQuoteRow, PriceQuoteItemRow } from "@kph/db/types/database";

export type QuoteWithMeta = PriceQuoteRow & { supplier_nome: string | null; total_itens: number; total_valor: number | null };

export async function listQuotes(unitId: string, mes?: number, ano?: number): Promise<QuoteWithMeta[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  let query = (supabase.from("price_quotes" as never) as ReturnType<typeof supabase.from>)
    .select("*, suppliers(nome), price_quote_items(total)")
    .eq("unit_id", unitId)
    .order("created_at", { ascending: false });
  if (mes && ano) {
    const start = `${ano}-${String(mes).padStart(2, "0")}-01`;
    query = query.eq("periodo", start);
  }
  const { data, error } = await query as unknown as { data: (PriceQuoteRow & { suppliers: { nome: string } | null; price_quote_items: { total: number | null }[] })[] | null; error: { message: string } | null };
  if (error) { console.error("[listQuotes]", error.message); return []; }
  return (data ?? []).map((r) => ({
    ...r,
    supplier_nome: r.suppliers?.nome ?? null,
    total_itens: r.price_quote_items?.length ?? 0,
    total_valor: r.price_quote_items?.reduce((acc, i) => acc + (i.total ?? 0), 0) ?? null,
  }));
}

export async function createQuote(input: Omit<PriceQuoteRow, "id" | "created_at" | "updated_at">): Promise<ActionResult<PriceQuoteRow>> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Supabase indisponível" };
  const result = await (supabase.from("price_quotes" as never) as ReturnType<typeof supabase.from>)
    .insert(input as never).select().single();
  const { data, error } = result as unknown as { data: PriceQuoteRow | null; error: { message: string } | null };
  if (error || !data) { console.error("[createQuote]", error?.message); return { ok: false, error: error?.message ?? "Falha" }; }
  revalidatePath("/compras/cotacoes");
  return { ok: true, data };
}

export async function updateQuoteStatus(id: string, status: PriceQuoteRow["status"]): Promise<ActionResult<PriceQuoteRow>> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Supabase indisponível" };
  const result = await (supabase.from("price_quotes" as never) as ReturnType<typeof supabase.from>)
    .update({ status } as never).eq("id", id).select().single();
  const { data, error } = result as unknown as { data: PriceQuoteRow | null; error: { message: string } | null };
  if (error || !data) { console.error("[updateQuoteStatus]", error?.message); return { ok: false, error: error?.message ?? "Falha" }; }
  revalidatePath("/compras/cotacoes");
  return { ok: true, data };
}

export async function listQuoteItems(quoteId: string): Promise<PriceQuoteItemRow[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];
  const result = await (supabase.from("price_quote_items" as never) as ReturnType<typeof supabase.from>)
    .select("*").eq("quote_id", quoteId).order("created_at");
  const { data, error } = result as unknown as { data: PriceQuoteItemRow[] | null; error: { message: string } | null };
  if (error) { console.error("[listQuoteItems]", error.message); return []; }
  return data ?? [];
}

export async function createQuoteItem(input: Omit<PriceQuoteItemRow, "id" | "total" | "created_at">): Promise<ActionResult<PriceQuoteItemRow>> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Supabase indisponível" };
  const result = await (supabase.from("price_quote_items" as never) as ReturnType<typeof supabase.from>)
    .insert(input as never).select().single();
  const { data, error } = result as unknown as { data: PriceQuoteItemRow | null; error: { message: string } | null };
  if (error || !data) { console.error("[createQuoteItem]", error?.message); return { ok: false, error: error?.message ?? "Falha" }; }
  revalidatePath("/compras/cotacoes");
  return { ok: true, data };
}

export async function deleteQuoteItem(id: string): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Supabase indisponível" };
  const result = await (supabase.from("price_quote_items" as never) as ReturnType<typeof supabase.from>)
    .delete().eq("id", id);
  const { error } = result as unknown as { error: { message: string } | null };
  if (error) { console.error("[deleteQuoteItem]", error.message); return { ok: false, error: error.message }; }
  revalidatePath("/compras/cotacoes");
  return { ok: true, data: null };
}
