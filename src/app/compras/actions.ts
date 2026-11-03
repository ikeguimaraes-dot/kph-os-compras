"use server";
import { parseUnitScope } from "@/lib/compras/unit-scope";

// Server Actions do módulo Compras.
//
// Tabelas em 019_compras.sql:
//   - suppliers       (CRUD)
//   - purchase_orders (CRUD + transições de status)
//   - purchase_order_items (cascade via order_id)
//
// Numeração `numero` é DEFAULT via sequence.
// `valor_total` mantido por trigger; `total` em items é GENERATED.

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "@kph/db/supabase/server";
import { requireUser } from "@kph/auth/server";
import { comprasAccess } from "@/lib/compras/everest-access";
import type { ActionResult } from "@/lib/result";
import {
  purchaseOrderCreateSchema,
  supplierSchema,
  supplierUpdateSchema,
  type PurchaseOrderCreateValues,
  type SupplierFormValues,
  type SupplierUpdateValues,
} from "@/lib/compras/schema";
import type {
  PurchaseOrder,
  PurchaseOrderDetail,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  PurchaseOrderWithRelations,
  Supplier,
} from "@/lib/compras/types";

const PO_TABLE = "purchase_orders" as const;
const POI_TABLE = "purchase_order_items" as const;
const SUP_TABLE = "suppliers" as const;

// ── Suppliers ────────────────────────────────────────────────

export async function listSuppliers(unitId?: string | null): Promise<Supplier[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];
    let q = supabase
      .from(SUP_TABLE)
      .select("*")
      .order("ativo", { ascending: false })
      .order("nome", { ascending: true });
    const unit = parseUnitScope(unitId);
    if (unit) q = q.eq("unit_id", unit);
    const { data, error } = await q;
    if (error) {
      console.error("[listSuppliers]", error.message);
      return [];
    }
    return (data ?? []) as Supplier[];
  } catch (e) {
    console.error("[listSuppliers] exceção:", e);
    return [];
  }
}

export async function getSupplier(id: string): Promise<Supplier | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from(SUP_TABLE)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error("[getSupplier]", error.message);
      return null;
    }
    return (data as Supplier | null) ?? null;
  } catch (e) {
    console.error("[getSupplier] exceção:", e);
    return null;
  }
}

export async function createSupplier(
  input: SupplierFormValues,
): Promise<ActionResult<Supplier>> {
  try {
    const parsed = supplierSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Inválido" };
    }
    await requireUser();
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Supabase indisponível" };

    const payload = {
      ...parsed.data,
      email: parsed.data.email || null,
      ativo: parsed.data.ativo ?? true,
    };
    const { data, error } = await supabase
      .from(SUP_TABLE)
      .insert(payload as never)
      .select()
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Falha" };

    revalidatePath("/compras/fornecedores");
    revalidatePath("/compras/novo");
    return { ok: true, data: data as Supplier };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro" };
  }
}

export async function updateSupplier(
  id: string,
  patch: SupplierUpdateValues,
): Promise<ActionResult<Supplier>> {
  try {
    const parsed = supplierUpdateSchema.safeParse(patch);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Inválido" };
    }
    await requireUser();
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Supabase indisponível" };

    const payload = { ...parsed.data, email: parsed.data.email || null };
    const { data, error } = await supabase
      .from(SUP_TABLE)
      .update(payload as never)
      .eq("id", id)
      .select()
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Falha" };

    revalidatePath("/compras/fornecedores");
    return { ok: true, data: data as Supplier };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro" };
  }
}

export async function toggleSupplierAtivo(
  id: string,
): Promise<ActionResult<Supplier>> {
  try {
    await requireUser();
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Supabase indisponível" };
    const { data: cur, error: rErr } = await supabase
      .from(SUP_TABLE)
      .select("ativo")
      .eq("id", id)
      .single();
    if (rErr || !cur) return { ok: false, error: rErr?.message ?? "Não encontrado" };
    const next = !(cur as { ativo: boolean }).ativo;
    const { data, error } = await supabase
      .from(SUP_TABLE)
      .update({ ativo: next } as never)
      .eq("id", id)
      .select()
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Falha" };
    revalidatePath("/compras/fornecedores");
    return { ok: true, data: data as Supplier };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro" };
  }
}

export async function deleteSupplier(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireUser();
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Supabase indisponível" };
    const { error } = await supabase.from(SUP_TABLE).delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/compras/fornecedores");
    return { ok: true, data: { id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro" };
  }
}

// ── Purchase Orders ──────────────────────────────────────────

export async function listPurchaseOrders(
  unitId?: string | null,
): Promise<PurchaseOrderWithRelations[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    type JoinRow = PurchaseOrder & {
      brand: { name: string; color: string } | { name: string; color: string }[] | null;
      unit: { name: string } | { name: string }[] | null;
      supplier: { nome: string } | { nome: string }[] | null;
      items: { count: number }[] | null;
    };

    let q = supabase
      .from(PO_TABLE)
      .select(
        "*, brand:brands(name, color), unit:units(name), supplier:suppliers(nome), items:purchase_order_items(count)",
      )
      .order("created_at", { ascending: false });
    const unit = parseUnitScope(unitId);
    if (unit) q = q.eq("unit_id", unit);
    const { data, error } = await q.returns<JoinRow[]>();
    if (error) {
      console.error("[listPurchaseOrders]", error.message);
      return [];
    }
    return (data ?? []).map((r) => {
      const b = Array.isArray(r.brand) ? r.brand[0] : r.brand;
      const u = Array.isArray(r.unit) ? r.unit[0] : r.unit;
      const s = Array.isArray(r.supplier) ? r.supplier[0] : r.supplier;
      const itemsCount = r.items?.[0]?.count ?? 0;
      const { brand, unit, supplier, items, ...rest } = r;
      void brand; void unit; void supplier; void items;
      return {
        ...rest,
        brand_name: b?.name ?? null,
        brand_color: b?.color ?? null,
        unit_name: u?.name ?? null,
        supplier_name: s?.nome ?? null,
        items_count: itemsCount,
      } as PurchaseOrderWithRelations;
    });
  } catch (e) {
    console.error("[listPurchaseOrders] exceção:", e);
    return [];
  }
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrderDetail | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;

    type JoinRow = PurchaseOrder & {
      brand: { name: string } | { name: string }[] | null;
      unit: { name: string } | { name: string }[] | null;
      supplier: { nome: string } | { nome: string }[] | null;
    };

    const { data, error } = await supabase
      .from(PO_TABLE)
      .select(
        "*, brand:brands(name), unit:units(name), supplier:suppliers(nome)",
      )
      .eq("id", id)
      .maybeSingle()
      .returns<JoinRow>();
    if (error) {
      console.error("[getPurchaseOrder]", error.message);
      return null;
    }
    if (!data) return null;

    const { data: items, error: itemsErr } = await supabase
      .from(POI_TABLE)
      .select("*")
      .eq("order_id", id)
      .order("created_at", { ascending: true });
    if (itemsErr) {
      console.error("[getPurchaseOrder/items]", itemsErr.message);
    }

    const b = Array.isArray(data.brand) ? data.brand[0] : data.brand;
    const u = Array.isArray(data.unit) ? data.unit[0] : data.unit;
    const s = Array.isArray(data.supplier) ? data.supplier[0] : data.supplier;
    const { brand, unit, supplier, ...rest } = data;
    void brand; void unit; void supplier;
    return {
      ...rest,
      items: (items ?? []) as PurchaseOrderItem[],
      brand_name: b?.name ?? null,
      unit_name: u?.name ?? null,
      supplier_name: s?.nome ?? null,
    } as PurchaseOrderDetail;
  } catch (e) {
    console.error("[getPurchaseOrder] exceção:", e);
    return null;
  }
}

export async function createPurchaseOrder(
  input: PurchaseOrderCreateValues,
): Promise<ActionResult<PurchaseOrder>> {
  try {
    const parsed = purchaseOrderCreateSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Inválido" };
    }
    const v = parsed.data;
    const { db, user } = await comprasAccess(v.unit_id);
    const roles = ["founder", "diretoria", "diretor", "comprador", "cfo", "head_financeiro"];
    if (!user.roles.some((r) => roles.includes(r.role.toLowerCase()) && (r.unitId === null || r.unitId === v.unit_id)))
      return { ok: false, error: "Seu perfil não pode criar pedidos nesta casa." };
    const unit = await db.from("units").select("brand_id").eq("id", v.unit_id).single();
    if (unit.error || unit.data.brand_id !== v.brand_id) return { ok: false, error: "Marca incompatível com a casa." };
    let root = v.fornecedor_grupo ?? null;
    let name = v.fornecedor ?? null;
    if (v.supplier_id) {
      const supplier = await db.from(SUP_TABLE).select("nome,cnpj,ativo,unit_id")
        .eq("id", v.supplier_id).eq("unit_id", v.unit_id).single();
      if (supplier.error || !supplier.data.ativo) return { ok: false, error: "Fornecedor inválido para a casa." };
      name = supplier.data.nome;
      const digits = (supplier.data.cnpj ?? "").replace(/\D/g, "");
      const supplierRoot = digits.length === 14 ? digits.slice(0, 8) : digits.length === 11 ? digits : null;
      if (supplierRoot) {
        const group = await db.from("compras_fornecedor_grupo").select("grupo_id").eq("raiz_cnpj", supplierRoot).maybeSingle();
        if (group.error) throw new Error(group.error.message);
        const resolved = group.data?.grupo_id ?? supplierRoot;
        if (root && root !== resolved) return { ok: false, error: "Grupo divergente do CNPJ cadastrado." };
        root = resolved;
      } else if (root) return { ok: false, error: "Fornecedor cadastrado sem CNPJ conciliável." };
    }
    if (root) {
      const group = await db.from("v_mapa_fornecedor").select("nome")
        .eq("unit_id", v.unit_id).eq("raiz_cnpj", root).maybeSingle();
      if (group.error || !group.data) return { ok: false, error: "Grupo fora da casa ou sem conciliação no mapa." };
      name = group.data.nome;
    }
    if (!name?.trim()) return { ok: false, error: "Informe o fornecedor." };
    const linked = [...new Set(v.items.flatMap((i) => i.insumo_id ? [i.insumo_id] : []))];
    if (linked.length) {
      if (!root) return { ok: false, error: "Selecione o grupo do fornecedor para vincular insumos." };
      const valid = await db.from("v_mapa_share").select("item_id").eq("unit_id", v.unit_id)
        .eq("raiz_cnpj", root).in("item_id", linked);
      if (valid.error || new Set(valid.data?.map((i) => i.item_id)).size !== linked.length)
        return { ok: false, error: "Insumo fora do fornecedor e da casa selecionados." };
    }
    const { data: order, error: oErr } = await db.rpc("compras_pedido_criar", {
      p_input: { ...v, fornecedor: name, fornecedor_grupo: root, cobertura_dias: v.cobertura_dias ?? 7 },
      p_user: user.id,
    });
    if (oErr || !order) return { ok: false, error: oErr?.message ?? "Falha ao criar pedido." };

    revalidatePath("/compras");
    return { ok: true, data: order as PurchaseOrder };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro" };
  }
}

/** Compatibility for old browser sessions; all transitions require the audited workflow. */
export async function updatePurchaseOrderStatus(_id: string, _status: PurchaseOrderStatus): Promise<ActionResult<PurchaseOrder>> {
  void _id; void _status;
  await requireUser();
  return {ok:false,error:'Abra Recebimento e conferência para aprovar, cancelar ou registrar a entrega com evidências.'};
}
export async function sendPurchaseOrder(id:string){return updatePurchaseOrderStatus(id,'enviado');}
export async function cancelPurchaseOrder(id:string){return updatePurchaseOrderStatus(id,'cancelado');}
export async function receivePurchaseOrderFull(id:string){return updatePurchaseOrderStatus(id,'recebido');}
export async function receivePurchaseOrderPartial(id:string,_received:Record<string,number>){void _received;return updatePurchaseOrderStatus(id,'parcial');}

export async function deletePurchaseOrder(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireUser();
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Supabase indisponível" };
    // RLS DELETE = founder only. Items cascateiam via FK ON DELETE CASCADE.
    const { error } = await supabase.from(PO_TABLE).delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/compras");
    return { ok: true, data: { id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro" };
  }
}

// ── Lead Time por CNPJ ───────────────────────────────────────

function _extractRaiz(cnpj: string): string {
  return cnpj.replace(/\D/g, "").slice(0, 8);
}

export async function getLeadTimeByCnpj(cnpj: string): Promise<number> {
  "use server";
  const raiz = _extractRaiz(cnpj);
  if (raiz.length < 8) return 3;
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return 3;
    const { data, error } = await supabase
      .from("compras_fornecedor_credito")
      .select("lead_time_dias")
      .eq("raiz_cnpj", raiz)
      .maybeSingle();
    if (error) {
      console.error("[getLeadTimeByCnpj]", error.message);
      return 3;
    }
    const row = data as { lead_time_dias: number | null } | null;
    return row?.lead_time_dias ?? 3;
  } catch (e) {
    console.error("[getLeadTimeByCnpj] exceção:", e);
    return 3;
  }
}

export async function saveLeadTimeByCnpj(
  cnpj: string,
  days: number,
): Promise<ActionResult<void>> {
  "use server";
  try {
    const raiz = _extractRaiz(cnpj);
    if (raiz.length < 8) return { ok: false, error: "CNPJ inválido" };
    const d = Math.max(1, Math.min(90, Math.round(days)));
    await requireUser();
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Supabase indisponível" };
    const { error } = await supabase
      .from("compras_fornecedor_credito")
      .upsert(
        { raiz_cnpj: raiz, lead_time_dias: d } as never,
        { onConflict: "raiz_cnpj" },
      );
    if (error) return { ok: false, error: error.message };
    revalidatePath("/compras/fornecedores");
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro" };
  }
}
