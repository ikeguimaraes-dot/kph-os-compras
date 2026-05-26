import { requireUser } from "@kph/auth/server";
import { listIngredients, listSuppliersForSelect } from "@/lib/compras/ingredient-actions";
import { IngredientsClient } from "./ingredientes-client";

export const dynamic = "force-dynamic";

export default async function IngredientsPage() {
  const user = await requireUser();
  const groupId = user.roles.find((r) => r.groupId)?.groupId ?? null;

  const [ingredients, suppliers] = await Promise.all([
    listIngredients(),
    listSuppliersForSelect(),
  ]);

  return (
    <IngredientsClient
      ingredients={ingredients}
      groupId={groupId ?? ""}
      suppliers={suppliers}
    />
  );
}
