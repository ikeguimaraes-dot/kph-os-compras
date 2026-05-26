import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { OperationsDatabase } from "../types/operations-database";

/**
 * Cliente Supabase para o banco de operações Meet & Eat.
 * Supabase project: laodipuodgrpqykrupms
 *
 * Contém dados do PDV (Workday) e ERP (TOTVS):
 *   - workday_resumo  — KPIs diários completos (CMV, ticket, lucro, pagamentos)
 *   - workday_venda   — vendas consolidadas por dia
 *   - workday_produtos — ranking de produtos
 *   - workday_grupos  — mix por categoria
 *   - workday_caixas  — detalhes por caixa
 *   - workday_usuarios — ranking de garçons/vendedores
 *   - titulos_a_pagar — contas a pagar (TOTVS)
 *   - vendas_diarias  — preenchimento manual diário
 *   - metas_projecoes — metas mensais e por dia da semana
 *   - notas_nutri / auditoria_nutricional / notas_detalhadas — nutrição
 *
 * NUNCA usar no bundle do cliente — OPERATIONS_SUPABASE_SERVICE_KEY é server-only.
 * Usar apenas em Server Actions e Route Handlers.
 */
export function createOperationsClient(): SupabaseClient<OperationsDatabase> | null {
  const url = process.env.OPERATIONS_SUPABASE_URL;
  const serviceKey = process.env.OPERATIONS_SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) return null;
  return createClient<OperationsDatabase>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Versão com anon key — para casos onde RLS estiver ativa no futuro.
 * Atualmente o banco não tem RLS configurado.
 */
export function createOperationsAnonClient(): SupabaseClient<OperationsDatabase> | null {
  const url = process.env.OPERATIONS_SUPABASE_URL;
  const anonKey = process.env.OPERATIONS_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient<OperationsDatabase>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
