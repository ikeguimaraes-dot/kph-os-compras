"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@kph/db/supabase/server";
import { requireUser } from "@kph/auth/server";
import { getCurrentUnit } from "@kph/auth/unit";
import type { ActionResult } from "@/lib/result";
import type { MenuItemFicha } from "@/lib/cardapio/types";

function revalidate(id?: string) {
  revalidatePath("/cardapio");
  if (id) revalidatePath(`/cardapio/${id}`);
}

// ── Queries ───────────────────────────────────────────────────

export async function listMenuItems(filtro?: {
  is_subproduto?: boolean;
  ativo?: boolean;
}): Promise<MenuItemFicha[]> {
  try {
    const unit = await getCurrentUnit();
    if (!unit) return [];
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    let q = supabase
      .from("menu_items")
      .select("*")
      .eq("unit_id", unit.id)
      .order("nome", { ascending: true });

    if (filtro?.is_subproduto !== undefined) q = q.eq("is_subproduto", filtro.is_subproduto);
    if (filtro?.ativo !== undefined) q = q.eq("ativo", filtro.ativo);

    const { data, error } = await q;
    if (error) { console.error("[listMenuItems]", error.message); return []; }
    return (data ?? []) as MenuItemFicha[];
  } catch (e) {
    console.error("[listMenuItems] exceção:", e);
    return [];
  }
}

export async function getMenuItem(id: string): Promise<MenuItemFicha | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) { console.error("[getMenuItem]", error.message); return null; }
    return (data as MenuItemFicha | null) ?? null;
  } catch (e) {
    console.error("[getMenuItem] exceção:", e);
    return null;
  }
}

// ── Mutations (preenchimento manual do que o PDF não traz) ────

export async function updateMenuItemPreco(
  id: string,
  preco_venda: number,
): Promise<ActionResult<MenuItemFicha>> {
  try {
    await requireUser();
    if (!(preco_venda >= 0)) return { ok: false, error: "Preço inválido" };
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Supabase indisponível" };

    const { data, error } = await supabase
      .from("menu_items")
      .update({ preco_venda } as never)
      .eq("id", id)
      .select()
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Falha" };

    revalidate(id);
    return { ok: true, data: data as MenuItemFicha };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro" };
  }
}

export async function updateMenuItemCategoria(
  id: string,
  categoria: string,
): Promise<ActionResult<MenuItemFicha>> {
  try {
    await requireUser();
    if (!categoria.trim()) return { ok: false, error: "Categoria obrigatória" };
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Supabase indisponível" };

    const { data, error } = await supabase
      .from("menu_items")
      .update({ categoria } as never)
      .eq("id", id)
      .select()
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Falha" };

    revalidate(id);
    return { ok: true, data: data as MenuItemFicha };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro" };
  }
}
