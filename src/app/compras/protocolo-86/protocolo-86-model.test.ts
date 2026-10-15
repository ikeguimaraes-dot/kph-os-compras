import { test } from "node:test";
import assert from "node:assert/strict";
import {
  openSummary,
  limitState,
  rowKey,
  normalizeSearch,
} from "./protocolo-86-model";
import type { Protocolo86Data } from "./protocolo-86-actions";

const dish = (
  unit_id: string,
  produto_id: string,
): Protocolo86Data["pratos"][number] => ({
  unit_id,
  produto_id,
  nome: "Prato",
  nome_venda_key: "PRATO",
  grupo: "Da Brasa",
  receita_12m: 100,
  classe_abc: "A",
  assinatura: true,
  teto_86_simultaneo: 0,
  critica: true,
  classe_86: "INEGOCIAVEL",
});
const episode = (
  unit_id: string,
  produto_venda_ficha_id: string,
  aberto = true,
): Protocolo86Data["episodios"][number] => ({
  unit_id,
  produto_venda_ficha_id,
  episodio_id: "episode",
  aberto,
  dias_em_falta: 1,
  data_inicio: "2026-10-01",
  mes_episodio: "2026-10-01",
});

test("limite zero alerta em qualquer falta; zero sem falta não é alerta", () => {
  assert.equal(limitState(1, 0), "exceeded");
  assert.equal(limitState(0, 0), "within");
  assert.equal(limitState(2, 2), "at-limit");
  assert.equal(limitState(3, 2), "exceeded");
  assert.equal(limitState(1, 2), "within");
});

test("consolidado separa categorias por casa e conta pratos únicos abertos", () => {
  const data: Protocolo86Data = {
    pratos: [dish("meet", "p1"), dish("madonna", "p2"), dish("meet", "p3")],
    episodios: [
      episode("meet", "p1"),
      episode("meet", "p1"),
      episode("madonna", "p2"),
      episode("meet", "p3", false),
    ],
    categorias: [],
    insumos: [],
    mesAtual: "2026-10-01",
    placar: {
      rs_perdido_mes: 0,
      por_classe: { INEGOCIAVEL: 4, PROTEGIDO: 0, GERENCIAVEL: 0, LIVRE: 0 },
    },
  };
  const summary = openSummary(data);
  assert.equal(summary.dishes.size, 2);
  assert.equal(summary.critical, 2);
  assert.equal(summary.categories.get(rowKey("meet", "Da Brasa")), 1);
  assert.equal(summary.categories.get(rowKey("madonna", "Da Brasa")), 1);
  assert.equal(summary.dishes.has(rowKey("meet", "p3")), false);
});

test("busca tolera acentos, caixa e espaços nas pontas", () => {
  assert.equal(normalizeSearch("  SALMÃO Frêneze "), "salmao freneze");
});
