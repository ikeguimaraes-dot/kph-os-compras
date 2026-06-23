import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@kph/db/supabase/server";
import { getMenuItem } from "@/lib/compras/menu-item-actions";
import {
  listRecipeItemsWithIngredients,
  getRecipeCostBreakdown,
} from "@/lib/compras/recipe-actions";
import { FichaClient } from "./ficha-client";

export const dynamic = "force-dynamic";

export interface RecipeNote {
  id: string;
  nota: string;
  created_at: string;
}

async function listRecipeNotes(menuItemId: string): Promise<RecipeNote[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("recipe_notes")
      .select("id, nota, created_at")
      .eq("menu_item_id", menuItemId)
      .order("created_at", { ascending: false });
    if (error) { console.error("[listRecipeNotes]", error.message); return []; }
    return (data ?? []) as RecipeNote[];
  } catch {
    return [];
  }
}

export default async function FichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const ficha = await getMenuItem(id);
  if (!ficha) notFound();

  const [items, breakdown, notes] = await Promise.all([
    listRecipeItemsWithIngredients(id),
    getRecipeCostBreakdown(id),
    listRecipeNotes(id),
  ]);

  return (
    <FichaClient ficha={ficha} items={items} breakdown={breakdown} notes={notes} />
  );
}
