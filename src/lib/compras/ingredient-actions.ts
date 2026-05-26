"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createServiceClient } from "@kph/db/supabase/server";
import { requireUser } from "@kph/auth/server";
import type { ActionResult } from "@/lib/result";
import type {
  Ingredient,
  IngredientInsert,
  IngredientUpdate,
  IngredientPriceHistory,
  IngredienteCategoria,
} from "@kph/db/types/compras-ingredientes";

const TABLE = "ingredients" as const;

function revalidate() {
  revalidatePath("/compras/ingredientes");
}

// ── Helpers ───────────────────────────────────────────────────

async function resolveGroupId(user: Awaited<ReturnType<typeof requireUser>>): Promise<string | null> {
  const fromRoles = user.roles.find((r) => r.groupId)?.groupId ?? null;
  if (fromRoles) return fromRoles;

  // Fallback para bypass/dev: pega o primeiro grupo do banco via service role.
  const service = createServiceClient();
  if (!service) return null;
  const { data } = await service.from("groups").select("id").limit(1).single();
  return (data as { id: string } | null)?.id ?? null;
}

// ── Queries ───────────────────────────────────────────────────

export async function listSuppliersForSelect(): Promise<{ id: string; nome: string }[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("suppliers")
      .select("id, nome")
      .eq("ativo", true)
      .order("nome");
    if (error) { console.error("[listSuppliersForSelect]", error.message); return []; }
    return (data ?? []) as { id: string; nome: string }[];
  } catch (e) {
    console.error("[listSuppliersForSelect] exceção:", e);
    return [];
  }
}

export async function listIngredients(filters?: {
  categoria?: IngredienteCategoria;
  ativo?: boolean;
  search?: string;
}): Promise<Ingredient[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    let q = supabase
      .from(TABLE)
      .select("*")
      .order("nome", { ascending: true });

    if (filters?.categoria) q = q.eq("categoria", filters.categoria);
    if (filters?.ativo !== undefined) q = q.eq("ativo", filters.ativo);
    if (filters?.search) {
      const s = `%${filters.search.trim()}%`;
      q = q.or(`nome.ilike.${s},codigo.ilike.${s}`);
    }

    const { data, error } = await q;
    if (error) { console.error("[listIngredients]", error.message); return []; }
    return (data ?? []) as Ingredient[];
  } catch (e) {
    console.error("[listIngredients] exceção:", e);
    return [];
  }
}

export async function getIngredient(id: string): Promise<Ingredient | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) { console.error("[getIngredient]", error.message); return null; }
    return (data as Ingredient | null) ?? null;
  } catch (e) {
    console.error("[getIngredient] exceção:", e);
    return null;
  }
}

export async function searchIngredientsForRecipe(
  search: string,
): Promise<Ingredient[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];
    const s = `%${search.trim()}%`;
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("ativo", true)
      .or(`nome.ilike.${s},codigo.ilike.${s}`)
      .order("nome")
      .limit(20);
    if (error) { console.error("[searchIngredientsForRecipe]", error.message); return []; }
    return (data ?? []) as Ingredient[];
  } catch (e) {
    console.error("[searchIngredientsForRecipe] exceção:", e);
    return [];
  }
}

// ── Mutations ─────────────────────────────────────────────────

export async function createIngredient(
  input: Omit<IngredientInsert, "group_id">,
): Promise<ActionResult<Ingredient>> {
  try {
    const user = await requireUser();
    const groupId = await resolveGroupId(user);
    if (!groupId) return { ok: false, error: "group_id não encontrado para o usuário" };

    if (!input.nome?.trim()) return { ok: false, error: "Nome obrigatório" };
    if (!input.categoria) return { ok: false, error: "Categoria obrigatória" };
    if (!input.unidade_padrao) return { ok: false, error: "Unidade obrigatória" };

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Supabase indisponível" };

    const payload: IngredientInsert = {
      group_id: groupId,
      nome: input.nome.trim(),
      categoria: input.categoria,
      unidade_padrao: input.unidade_padrao,
      custo_padrao: input.custo_padrao ?? 0,
      codigo: input.codigo?.trim() || null,
      fornecedor_id: input.fornecedor_id ?? null,
      perdas_padrao: input.perdas_padrao ?? null,
      observacoes: input.observacoes?.trim() || null,
      ativo: input.ativo ?? true,
    };

    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload as never)
      .select()
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Falha ao criar" };

    revalidate();
    return { ok: true, data: data as Ingredient };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro" };
  }
}

export async function updateIngredient(
  id: string,
  patch: IngredientUpdate,
): Promise<ActionResult<Ingredient>> {
  try {
    await requireUser();
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Supabase indisponível" };

    const { data, error } = await supabase
      .from(TABLE)
      .update(patch as never)
      .eq("id", id)
      .select()
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Falha ao atualizar" };

    revalidate();
    return { ok: true, data: data as Ingredient };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro" };
  }
}

export async function toggleIngredientAtivo(
  id: string,
): Promise<ActionResult<Ingredient>> {
  try {
    await requireUser();
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Supabase indisponível" };

    const { data: current, error: readErr } = await supabase
      .from(TABLE)
      .select("ativo")
      .eq("id", id)
      .single();
    if (readErr || !current) return { ok: false, error: readErr?.message ?? "Não encontrado" };

    const next = !(current as { ativo: boolean }).ativo;
    const { data, error } = await supabase
      .from(TABLE)
      .update({ ativo: next } as never)
      .eq("id", id)
      .select()
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Falha" };

    revalidate();
    return { ok: true, data: data as Ingredient };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro" };
  }
}

export async function listIngredientPriceHistory(
  ingredientId: string,
): Promise<IngredientPriceHistory[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("ingredient_price_history")
      .select("*")
      .eq("ingredient_id", ingredientId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) { console.error("[listIngredientPriceHistory]", error.message); return []; }
    return (data ?? []) as IngredientPriceHistory[];
  } catch (e) {
    console.error("[listIngredientPriceHistory] exceção:", e);
    return [];
  }
}
