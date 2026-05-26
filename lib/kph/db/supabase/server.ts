import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import type { Database } from "../types/database";

/**
 * Cliente Supabase para Server Components / Server Actions / Route Handlers.
 * Lê cookies via next/headers — a sessão é compartilhada com o cliente browser.
 *
 * Em Server Components, setAll é no-op (cookies só podem ser escritos durante
 * Server Actions ou Route Handlers — Next levanta erro se tentar). Por isso
 * tratamos a exceção silenciosamente.
 */
export async function createSupabaseServerClient(
  resolvedCookieStore?: Awaited<ReturnType<typeof cookies>>
): Promise<SupabaseClient<Database> | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const cookieStore = resolvedCookieStore ?? (await cookies());

  // AUTH DESATIVADO: sem sessão → service role para bypassar RLS
  const hasSession = cookieStore.getAll().some((c) => c.name.includes("auth-token"));
  if (!hasSession) return createServiceClient();

  // Aplica o Set-Cookie do middleware se a request foi um Server Action
  // (Next.js 14+ tem bug que dropa Set-Cookie de middleware em Server Actions)
  const headerStore = await headers();
  const middlewareCookies = headerStore.get("x-middleware-set-cookie");
  if (middlewareCookies) {
    try {
      const parsed = JSON.parse(middlewareCookies);
      for (const { name, value, options } of parsed) {
        cookieStore.set(name, value, options);
      }
    } catch {
      // Ignorar, provavelmente Server Component
    }
  }

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component: cookies não podem ser escritos. proxy.ts
          // cuida do refresh. Ignorar é seguro.
        }
      },
    },
  });
}

/**
 * Cliente com service role — bypassa RLS. Usar APENAS em Server Actions /
 * Route Handlers de confiança (audit_log writer, jobs internos).
 * NUNCA expor SUPABASE_SERVICE_ROLE_KEY no bundle do client.
 */
export function createServiceClient(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
