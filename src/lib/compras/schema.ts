// Schemas zod do módulo Compras.
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

export const supplierSchema = z.object({
  unit_id: z.string().uuid("unit_id obrigatório"),
  brand_id: z.string().uuid("brand_id obrigatório"),
  nome: z.string().trim().min(1, "Nome obrigatório").max(160),
  cnpj: z.string().trim().max(20).optional().nullable(),
  telefone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().email("Email inválido").optional().nullable().or(z.literal("")),
  categoria: z.string().trim().max(80).optional().nullable(),
  ativo: z.boolean().optional(),
});
export type SupplierFormValues = z.infer<typeof supplierSchema>;

export const supplierUpdateSchema = supplierSchema
  .partial()
  .omit({ unit_id: true, brand_id: true });
export type SupplierUpdateValues = z.infer<typeof supplierUpdateSchema>;

export const purchaseOrderItemSchema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(1, "Nome do item obrigatório"),
  unidade: z.string().trim().max(20).optional().nullable(),
  quantidade: z.number().positive("Quantidade > 0"),
  preco_unitario: z.number().nonnegative("Preço deve ser >= 0"),
});
export type PurchaseOrderItemValues = z.infer<typeof purchaseOrderItemSchema>;

export const purchaseOrderCreateSchema = z.object({
  unit_id: z.string().uuid(),
  brand_id: z.string().uuid(),
  fornecedor: z.string().trim().max(160).optional().nullable(),
  supplier_id: z.string().uuid().optional().nullable(),
  data_pedido: isoDate,
  data_prevista: isoDate.optional().nullable(),
  observacoes: z.string().trim().max(2000).optional().nullable(),
  items: z.array(purchaseOrderItemSchema).min(1, "Adicione pelo menos um item"),
});
export type PurchaseOrderCreateValues = z.infer<typeof purchaseOrderCreateSchema>;
