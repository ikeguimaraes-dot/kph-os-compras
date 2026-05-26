"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CurrentUser } from "./server";
import type { Unit } from "@kph/db/types/database";
import { getBrowserClient } from "@kph/db/supabase/client";

type AuthContextValue = {
  user: CurrentUser | null;
  units: Unit[];
  unitId: string | null;
  setUnitId: (id: string) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const STORED_UNIT_KEY = "kph_unit_id";
// Cookie espelha o localStorage pra Server Components conseguirem ler.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 ano

function persistUnit(id: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORED_UNIT_KEY, id);
  document.cookie = `${STORED_UNIT_KEY}=${encodeURIComponent(id)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

/**
 * Provider montado no layout do dashboard. Recebe o user (já validado pelo
 * proxy.ts + server-fetched no layout) e os units acessíveis.
 *
 * unitId é persistido em localStorage. Se nunca setado, escolhe a primeira
 * unit que o user tem role.
 */
export function AuthProvider({
  user,
  units,
  children,
}: {
  user: CurrentUser | null;
  units: Unit[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [unitId, setUnitIdState] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORED_UNIT_KEY);
    const valid = stored && units.some((u) => u.id === stored) ? stored : null;
    const fallback = units[0]?.id ?? null;
    const next = valid ?? fallback;
    // Hidratação do localStorage — setState dentro de useEffect é intencional
    // aqui (não dá pra ler localStorage durante render). Cookie já vem do
    // servidor; este useEffect só cobre o caso "localStorage tem unit que
    // o cookie expirou" — re-escreve o cookie no `persistUnit` abaixo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUnitIdState(next);
    if (next) persistUnit(next);
  }, [units]);

  /**
   * Troca a unit e invalida o tree do servidor.
   *
   * router.refresh() é crítico: sem ele, Server Components renderizados com
   * o cookie antigo continuam servidos do router cache do Next quando o
   * user navega — resultando em "voltar pra Madonna" (o fallback alfabético
   * de getCurrentUnit) ao trocar pra Meet & Eat e mudar de página.
   */
  const setUnitId = (id: string) => {
    if (id === unitId) return;
    setUnitIdState(id);
    persistUnit(id);
    router.refresh();
  };

  const signOut = async () => {
    // Centralizado em rota — limpa cookies via Server Action e redireciona.
    if (typeof window !== "undefined") {
      window.location.href = "/auth/sign-out";
    }
  };

  const value = useMemo<AuthContextValue>(
    () => ({ user, units, unitId, setUnitId, signOut }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, units, unitId],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth: precisa estar dentro de <AuthProvider>");
  }
  return ctx;
}

/** Roles do user atual (array). */
export function useRoles() {
  return useAuth().user?.roles ?? [];
}

/** Unit selecionada hoje (objeto Unit completo) e o setter. */
export function useUnit() {
  const { units, unitId, setUnitId } = useAuth();
  const unit = units.find((u) => u.id === unitId) ?? null;
  return { unit, units, setUnit: setUnitId };
}

/** Helper barato pra checar role no client (não substitui RLS no servidor). */
export function useHasRole(allowed: ReadonlyArray<string>): boolean {
  const roles = useRoles();
  return roles.some((r) => allowed.includes(r.role));
}

/** Acesso direto ao Supabase no browser (com sessão atual). */
export function useSupabase() {
  // Recriar o client em cada render é barato (singleton interno do @supabase/ssr).
  return getBrowserClient();
}
