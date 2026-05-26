"use server";

// Server Actions do módulo Notificações in-app.

import { revalidatePath } from "next/cache";

import {
  createServiceClient,
  createSupabaseServerClient,
} from "@kph/db/supabase/server";
import { requireUser } from "@kph/auth/server";
import type { ActionResult } from "@/lib/result";
import type { Notification } from "@/lib/notifications/types";

const T = "notifications" as const;

/** Lista as N notificações mais recentes do user logado. */
export async function listNotifications(limit = 10): Promise<Notification[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from(T)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("[listNotifications]", error.message);
      return [];
    }
    return (data ?? []) as Notification[];
  } catch (e) {
    console.error("[listNotifications] exceção:", e);
    return [];
  }
}

/** Conta notificações não lidas do user logado. */
export async function countUnread(): Promise<number> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return 0;
    const { count, error } = await supabase
      .from(T)
      .select("*", { count: "exact", head: true })
      .eq("lida", false);
    if (error) {
      console.error("[countUnread]", error.message);
      return 0;
    }
    return count ?? 0;
  } catch (e) {
    console.error("[countUnread] exceção:", e);
    return 0;
  }
}

export async function markAsRead(id: string): Promise<ActionResult<null>> {
  try {
    await requireUser();
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Supabase indisponível" };
    const { error } = await supabase
      .from(T)
      .update({ lida: true } as never)
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/", "layout");
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro" };
  }
}

export async function markAllAsRead(): Promise<ActionResult<{ count: number }>> {
  try {
    const user = await requireUser();
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Supabase indisponível" };
    const { error, count } = await supabase
      .from(T)
      .update({ lida: true } as never, { count: "exact" })
      .eq("user_id", user.id)
      .eq("lida", false);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/", "layout");
    return { ok: true, data: { count: count ?? 0 } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro" };
  }
}

/**
 * Cria uma notificação. Usa service_role (bypassa RLS) — necessário pra
 * permitir notificar OUTROS usuários (ex: avaliador notifica avaliado).
 *
 * Retorna ok:true mesmo se userId for null/undefined — é design intencional
 * pra integrações chamarem em fluxos onde o destinatário pode não ter user
 * vinculado (ex: férias criadas via app sem created_by). Loga e segue.
 */
export async function createNotification(
  userId: string | null | undefined,
  tipo: string,
  titulo: string,
  mensagem?: string | null,
  link?: string | null,
): Promise<ActionResult<Notification | null>> {
  try {
    if (!userId) {
      return { ok: true, data: null };
    }
    const admin = createServiceClient();
    if (!admin) {
      console.warn("[createNotification] service client indisponível");
      return { ok: false, error: "Service client indisponível" };
    }
    const payload = {
      user_id: userId,
      tipo,
      titulo,
      mensagem: mensagem ?? null,
      link: link ?? null,
    };
    const { data, error } = await admin
      .from(T)
      .insert(payload as never)
      .select()
      .single();
    if (error || !data) {
      console.error("[createNotification]", error?.message);
      return { ok: false, error: error?.message ?? "Falha" };
    }
    return { ok: true, data: data as Notification };
  } catch (e) {
    console.error("[createNotification] exceção:", e);
    return { ok: false, error: e instanceof Error ? e.message : "Erro" };
  }
}
