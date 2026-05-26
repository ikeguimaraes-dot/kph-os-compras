// Tipos do módulo Compras (migration 019_compras.sql).

import type {
  PurchaseOrderItemRow,
  PurchaseOrderRow,
  PurchaseOrderStatus,
  SupplierRow,
} from "@kph/db/types/database";

export type { PurchaseOrderStatus };

export type Supplier = SupplierRow;
export type PurchaseOrder = PurchaseOrderRow;
export type PurchaseOrderItem = PurchaseOrderItemRow;

export type SupplierInsert = Omit<Supplier, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};
export type SupplierUpdate = Partial<Omit<SupplierInsert, "unit_id" | "brand_id">>;

export type PurchaseOrderItemInput = {
  id?: string;
  nome: string;
  unidade: string | null;
  quantidade: number;
  preco_unitario: number;
};

export type PurchaseOrderInsert = {
  unit_id: string;
  brand_id: string;
  fornecedor: string | null;
  supplier_id: string | null;
  data_pedido: string;
  data_prevista: string | null;
  observacoes: string | null;
};

export type PurchaseOrderUpdate = {
  fornecedor?: string | null;
  supplier_id?: string | null;
  data_pedido?: string;
  data_prevista?: string | null;
  observacoes?: string | null;
  status?: PurchaseOrderStatus;
};

export type PurchaseOrderWithRelations = PurchaseOrder & {
  unit_name: string | null;
  brand_name: string | null;
  brand_color: string | null;
  supplier_name: string | null;
  items_count: number;
};

export type PurchaseOrderDetail = PurchaseOrder & {
  items: PurchaseOrderItem[];
  unit_name: string | null;
  brand_name: string | null;
  supplier_name: string | null;
};

// Mapeamento status → label/cor pra UI.
export const PO_STATUS_META: Record<
  PurchaseOrderStatus,
  { label: string; fg: string; bg: string }
> = {
  rascunho:  { label: "Rascunho",  fg: "var(--text-3)", bg: "var(--surface-2)" },
  enviado:   { label: "Enviado",   fg: "#1D4ED8",       bg: "rgba(59,130,246,0.16)" },
  parcial:   { label: "Parcial",   fg: "#A16207",       bg: "rgba(245,158,11,0.16)" },
  recebido:  { label: "Recebido",  fg: "#15803D",       bg: "rgba(34,197,94,0.16)" },
  cancelado: { label: "Cancelado", fg: "#B91C1C",       bg: "rgba(239,68,68,0.10)" },
};
