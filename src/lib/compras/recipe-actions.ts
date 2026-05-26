"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createServiceClient } from "@kph/db/supabase/server";
import { requireUser } from "@kph/auth/server";
import type { ActionResult } from "@/lib/result";
import type {
  RecipeItemExtended,
  RecipeItemWithIngredient,
  Ingredient,
} from "@kph/db/types/compras-ingredientes";

function revalidateCardapio(menuItemId: string) {
  revalidatePath(`/cardapio/${menuItemId}`);
  revalidatePath("/cardapio");
}

// ── Queries ───────────────────────────────────────────────────

export async function listRecipeItemsWithIngredients(
  menuItemId: string,
): Promise<RecipeItemWithIngredient[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    type JoinRow = RecipeItemExtended & {
      ingredient: Ingredient | Ingredient[] | null;
    };

    const { data, error } = await supabase
      .from("recipe_items")
      .select("*, ingredient:ingredients(*)")
      .eq("menu_item_id", menuItemId)
      .order("created_at")
      .returns<JoinRow[]>();

    if (error) { console.error("[listRecipeItemsWithIngredients]", error.message); return []; }

    return (data ?? []).map((r) => {
      const ing = Array.isArray(r.ingredient) ? r.ingredient[0] : r.ingredient;
      const { ingredient: _i, ...rest } = r;
      void _i;
      return { ...rest, ingredient: ing ?? null } as RecipeItemWithIngredient;
    });
  } catch (e) {
    console.error("[listRecipeItemsWithIngredients] exceção:", e);
    return [];
  }
}

export async function getRecipeCostBreakdown(menuItemId: string): Promise<{
  total_cost: number;
  by_categoria: Record<string, number>;
  items: Array<{
    nome: string;
    quantidade: number;
    unidade: string | null;
    custo: number;
    pct_total: number;
  }>;
}> {
  const rows = await listRecipeItemsWithIngredients(menuItemId);
  const total = rows.reduce((s, r) => s + Number(r.custo_total), 0);

  const by_categoria: Record<string, number> = {};
  for (const r of rows) {
    const cat = r.ingredient?.categoria ?? "avulso";
    by_categoria[cat] = (by_categoria[cat] ?? 0) + Number(r.custo_total);
  }

  const items = rows.map((r) => ({
    nome: r.ingredient?.nome ?? r.insumo,
    quantidade: Number(r.quantidade),
    unidade: r.unidade ?? r.ingredient?.unidade_padrao ?? null,
    custo: Number(r.custo_total),
    pct_total: total > 0 ? (Number(r.custo_total) / total) * 100 : 0,
  }));

  return { total_cost: total, by_categoria, items };
}

// ── Mutations ─────────────────────────────────────────────────

export async function addRecipeItemWithIngredient(input: {
  menu_item_id: string;
  ingredient_id?: string | null;
  insumo?: string;
  quantidade: number;
  unidade?: string | null;
  custo_unitario?: number;
  perda_pct?: number | null;
}): Promise<ActionResult<RecipeItemExtended>> {
  try {
    await requireUser();
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Supabase indisponível" };

    let custo = input.custo_unitario ?? 0;
    let insumoName = input.insumo ?? "";

    // Se ingredient_id fornecido, carrega custo e nome do ingrediente.
    if (input.ingredient_id) {
      const { data: ing } = await supabase
        .from("ingredients")
        .select("nome, custo_padrao, unidade_padrao")
        .eq("id", input.ingredient_id)
        .single();
      if (ing) {
        custo = Number((ing as { custo_padrao: string }).custo_padrao);
        insumoName = insumoName || (ing as { nome: string }).nome;
      }
    }

    if (!insumoName.trim()) return { ok: false, error: "Nome do insumo obrigatório" };
    if (input.quantidade <= 0) return { ok: false, error: "Quantidade deve ser > 0" };

    const payload = {
      menu_item_id: input.menu_item_id,
      ingredient_id: input.ingredient_id ?? null,
      insumo: insumoName.trim(),
      quantidade: input.quantidade,
      unidade: input.unidade ?? null,
      custo_unitario: custo,
      perda_pct: input.perda_pct ?? null,
    };

    const { data, error } = await supabase
      .from("recipe_items")
      .insert(payload as never)
      .select()
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Falha" };

    revalidateCardapio(input.menu_item_id);
    return { ok: true, data: data as RecipeItemExtended };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro" };
  }
}

export async function updateRecipeItemExtended(
  id: string,
  menuItemId: string,
  patch: {
    insumo?: string;
    quantidade?: number;
    unidade?: string | null;
    custo_unitario?: number;
    perda_pct?: number | null;
    ingredient_id?: string | null;
  },
): Promise<ActionResult<RecipeItemExtended>> {
  try {
    await requireUser();
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Supabase indisponível" };

    const { data, error } = await supabase
      .from("recipe_items")
      .update(patch as never)
      .eq("id", id)
      .select()
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Falha" };

    revalidateCardapio(menuItemId);
    return { ok: true, data: data as RecipeItemExtended };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro" };
  }
}

export async function removeRecipeItemExtended(
  id: string,
  menuItemId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireUser();
    // ri_delete RLS still references the old cmv_item_id column; use service
    // role to bypass the stale policy until a migration fixes it.
    const supabase = createServiceClient() ?? await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Supabase indisponível" };

    const { error } = await supabase.from("recipe_items").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };

    revalidateCardapio(menuItemId);
    return { ok: true, data: { id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro" };
  }
}

export async function linkRecipeItemToIngredient(
  recipeItemId: string,
  menuItemId: string,
  ingredientId: string | null,
): Promise<ActionResult<RecipeItemExtended>> {
  try {
    await requireUser();
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Supabase indisponível" };

    // Se linkando a um ingrediente, sincroniza custo_unitario.
    const patch: Record<string, unknown> = { ingredient_id: ingredientId };
    if (ingredientId) {
      const { data: ing } = await supabase
        .from("ingredients")
        .select("custo_padrao")
        .eq("id", ingredientId)
        .single();
      if (ing) patch.custo_unitario = Number((ing as { custo_padrao: string }).custo_padrao);
    }

    const { data, error } = await supabase
      .from("recipe_items")
      .update(patch as never)
      .eq("id", recipeItemId)
      .select()
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Falha" };

    revalidateCardapio(menuItemId);
    return { ok: true, data: data as RecipeItemExtended };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro" };
  }
}

export async function duplicateRecipe(
  sourceMenuItemId: string,
  targetMenuItemId: string,
): Promise<ActionResult<{ count: number }>> {
  try {
    await requireUser();
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Supabase indisponível" };

    const { data: sourceItems, error: readErr } = await supabase
      .from("recipe_items")
      .select("insumo, unidade, quantidade, custo_unitario, ingredient_id, perda_pct")
      .eq("menu_item_id", sourceMenuItemId);
    if (readErr) return { ok: false, error: readErr.message };
    if (!sourceItems?.length) return { ok: false, error: "Receita de origem sem itens" };

    type SourceRow = { insumo: string; unidade: string | null; quantidade: string; custo_unitario: string; ingredient_id: string | null; perda_pct: string | null };
    const inserts = (sourceItems as SourceRow[]).map((r) => ({ ...r, menu_item_id: targetMenuItemId }));
    const { error: insertErr } = await supabase.from("recipe_items").insert(inserts as never);
    if (insertErr) return { ok: false, error: insertErr.message };

    revalidateCardapio(targetMenuItemId);
    return { ok: true, data: { count: inserts.length } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro" };
  }
}

// ── Recipe notes ──────────────────────────────────────────────

export async function addRecipeNote(
  menuItemId: string,
  nota: string,
): Promise<ActionResult<{ id: string; nota: string; created_at: string }>> {
  try {
    if (!nota.trim()) return { ok: false, error: "Nota não pode estar vazia" };
    const user = await requireUser();
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Supabase indisponível" };

    const { data, error } = await supabase
      .from("recipe_notes")
      .insert({
        menu_item_id: menuItemId,
        nota: nota.trim(),
        created_by: user.id === "bypass" ? null : user.id,
      } as never)
      .select()
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Falha" };

    revalidateCardapio(menuItemId);
    return { ok: true, data: data as { id: string; nota: string; created_at: string } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro" };
  }
}

export async function removeRecipeNote(
  noteId: string,
  menuItemId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireUser();
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Supabase indisponível" };

    const { error } = await supabase.from("recipe_notes").delete().eq("id", noteId);
    if (error) return { ok: false, error: error.message };

    revalidateCardapio(menuItemId);
    return { ok: true, data: { id: noteId } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro" };
  }
}
