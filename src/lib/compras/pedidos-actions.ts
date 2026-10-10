"use server";
import { z } from "zod";
import { comprasAccess } from "./everest-access";
import type { PedidoConsumption, PedidoContext, PedidoCredit, PedidoStock, PedidoSupplier } from "./pedidos";

export async function getPedidoRegisteredContext(raw: { unit: string; supplierId: string }): Promise<PedidoContext> {
  const v = z.object({ unit: z.uuid(), supplierId: z.uuid() }).parse(raw);
  const { db } = await comprasAccess(v.unit);
  const supplier = await db.from("suppliers").select("cnpj").eq("unit_id", v.unit).eq("id", v.supplierId).eq("ativo", true).single();
  if (supplier.error) throw new Error(supplier.error.message);
  const cnpj = (supplier.data.cnpj ?? "").replace(/\D/g, "");
  if (![11, 14].includes(cnpj.length)) return { credit: null, items: [], readAt: new Date().toISOString() };
  const root = cnpj.length === 14 ? cnpj.slice(0, 8) : cnpj;
  const group = await db.from("compras_fornecedor_grupo").select("grupo_id").eq("raiz_cnpj", root).maybeSingle();
  if (group.error) throw new Error(group.error.message);
  return getPedidoContext({ unit: v.unit, root: group.data?.grupo_id ?? root });
}

export async function getPedidoSuppliers(unit: string): Promise<PedidoSupplier[]> {
  const { db } = await comprasAccess(z.uuid().parse(unit));
  const rows: PedidoSupplier[] = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await db.from("v_mapa_fornecedor").select("raiz_cnpj,nome")
      .eq("unit_id", unit).order("raiz_cnpj").range(offset, offset + 999);
    if (r.error) throw new Error(r.error.message);
    rows.push(...r.data);
    if (r.data.length < 1000) return rows.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }
}

export async function getPedidoContext(raw: { unit: string; root: string }): Promise<PedidoContext> {
  const v = z.object({ unit: z.uuid(), root: z.string().min(1).max(100) }).parse(raw);
  const { db } = await comprasAccess(v.unit);
  const allowed = await db.from("v_mapa_fornecedor").select("raiz_cnpj")
    .eq("unit_id", v.unit).eq("raiz_cnpj", v.root).maybeSingle();
  if (allowed.error || !allowed.data) throw new Error("Fornecedor fora da casa autorizada.");
  async function rows<T>(table: string, key: string, fields = "*") {
    const result: T[] = [];
    for (let offset = 0; ; offset += 1000) {
      let q = db.from(table).select(fields).eq("unit_id", v.unit);
      if (table === "v_mapa_share") q = q.eq("raiz_cnpj", v.root);
      q = q.order(key);
      if (table === "v_pedido_consumo_dow") q = q.order("dow");
      const r = await q.range(offset, offset + 999);
      if (r.error) throw new Error(r.error.message);
      result.push(...r.data as unknown as T[]);
      if (r.data.length < 1000) return result;
    }
  }
  const [credit, shares, stocks, consumption, blocks] = await Promise.all([
    db.from("v_pedido_credito").select("*").eq("raiz_cnpj", v.root).single(),
    rows<{ item_id: string }>("v_mapa_share", "item_id", "item_id"),
    rows<PedidoStock>("v_pedido_estoque", "item_id"),
    rows<PedidoConsumption>("v_pedido_consumo_dow", "insumo_id"),
    rows<{ prato_id: string; nome: string }>("v_mapa_86", "id", "prato_id,nome"),
  ]);
  if (credit.error) throw new Error(credit.error.message);
  const ids = [...new Set(shares.map((s) => s.item_id).filter(Boolean))];
  const catalog: { id: string; descricao: string; unidade_medida: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const r = await db.from("everest_itens").select("id,descricao,unidade_medida").in("id", ids.slice(i, i + 100));
    if (r.error) throw new Error(r.error.message);
    catalog.push(...r.data);
  }
  return {
    credit: credit.data as PedidoCredit, readAt: new Date().toISOString(),
    items: catalog.sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR")).map((item) => {
      const days = consumption.filter((c) => c.insumo_id === item.id);
      const dishes = new Set(days.flatMap((d) => d.pratos.map((p) => p.produto_id)));
      return { ...item, stock: stocks.find((s) => s.item_id === item.id) ?? null, consumption: days,
        desbloqueia: [...new Set(blocks.filter((b) => dishes.has(b.prato_id)).map((b) => b.nome))] };
    }),
  };
}
