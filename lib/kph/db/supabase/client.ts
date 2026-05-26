"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

/**
 * Cliente Supabase para Client Components — usa cookies do browser
 * compatíveis com a sessão SSR (lida pelo proxy.ts e Server Components).
 *
 * Sem env vars: retorna null. Hooks devem degradar com graça.
 */
export function getBrowserClient(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createBrowserClient<Database>(url, anonKey);
}
