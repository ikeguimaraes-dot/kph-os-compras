import "server-only";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@kph/db/supabase/server";
import type { Unit } from "@kph/db/types/database";

const COOKIE_KEY = "kph_unit_id";

/**
 * Resolve a unit selecionada (server-side) lendo o cookie escrito pelo
 * AuthProvider. Se cookie ausente, inválido (UUID que não existe) ou
 * apontando pra unit que o user não acessa, cai pra primeira unit acessível.
 *
 * Falha em qualquer query NÃO derruba o request — loga e retorna null.
 */
export async function getCurrentUnit(): Promise<Unit | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      console.warn("[getCurrentUnit] supabase indisponível (env vars vazias)");
      return null;
    }

    const cookieStore = await cookies();
    const cookieId = cookieStore.get(COOKIE_KEY)?.value;

    // 1) Tenta resolver pela unit no cookie. Se RLS bloquear ou não existir,
    //    cai no fallback abaixo.
    if (cookieId) {
      const { data, error } = await supabase
        .from("units")
        .select("*")
        .eq("id", cookieId)
        .eq("active", true)
        .maybeSingle();
      if (error) {
        console.warn("[getCurrentUnit] cookie lookup error:", error.message);
      }
      if (data) return data as Unit;
    }

    // 2) Fallback: primeira unit ativa que o user pode ver (RLS aplica).
    const { data, error } = await supabase
      .from("units")
      .select("*")
      .eq("active", true)
      .order("name")
      .limit(1);
    if (error) {
      console.error("[getCurrentUnit] fallback query error:", error.message);
      return null;
    }
    const first = data?.[0];
    if (!first) {
      console.warn("[getCurrentUnit] user não tem unit acessível (RLS sem match)");
      return null;
    }
    return first as Unit;
  } catch (e) {
    console.error("[getCurrentUnit] exceção:", e);
    return null;
  }
}
