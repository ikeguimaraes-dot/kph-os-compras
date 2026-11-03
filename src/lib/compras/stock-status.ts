export function getStockStatus(stock: number | null, min: number | null, max: number | null, origem = "compra") {
  if (origem === "bloqueado") return { label: "Bloqueado", color: "#7c3aed" };
  if (stock == null) return { label: "A contar", color: "#6b7280" };
  if (max != null && stock > max) return { label: "Acima do máx", color: "#1d6fa5" };
  if (stock <= 0) return { label: "Zerado", color: "#b91c1c" };
  if (min != null && stock >= min) return { label: "OK", color: "#15803d" };
  if (min != null && stock < min) return { label: "Abaixo do mínimo", color: "#b45309" };
  return { label: "—", color: "#6b7280" };
}
