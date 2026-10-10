import test from "node:test";
import assert from "node:assert/strict";
import { supplierMetrics } from "../src/lib/compras/supplier-metrics";
import type { MapSupplier } from "../src/lib/compras/prisma-mapa";

const supplier = (spend: number, revenue: number) =>
  ({ gasto_12m: spend, receita_atribuida: revenue }) as MapSupplier;

test("fornecedor mostra compra anual, receita atribuída e razão Y/X com uma casa decimal", () => {
  const [compra, sustenta, alavanca] = supplierMetrics(supplier(1000, 3400));
  assert.ok(compra && sustenta && alavanca, "supplierMetrics deve retornar 3 itens");
  assert.match(compra.label, /^Compra: R\$\s1\.000,00\/ano$/);
  assert.match(sustenta.label, /^Sustenta: R\$\s3\.400,00 de venda$/);
  assert.equal(alavanca.label, "Alavanca: 3,4x");
  assert.ok([compra, sustenta, alavanca].every(m => m.source.length > 50));
});

test("compra zero e fornecedor ausente não produzem infinito nem alavanca fictícia", () => {
  const [,, semBase] = supplierMetrics(supplier(0, 3400));
  assert.equal(semBase?.label, "Alavanca: sem base");
  assert.ok(supplierMetrics(undefined).every(m => m.label.endsWith("sem base")));
  const [,, zero] = supplierMetrics(supplier(1000, 0));
  assert.equal(zero?.label, "Alavanca: 0,0x");
});
