import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_UNITS, resolveUnitSelection } from "../lib/kph/auth/unit-selection";

const units = [{ id: "casa-a" }, { id: "casa-b" }];

test("todas as casas sobrevive à leitura da seleção persistida", () => {
  assert.equal(resolveUnitSelection(ALL_UNITS, units), ALL_UNITS);
});

test("mantém casa autorizada e descarta seleção de casa sem acesso", () => {
  assert.equal(resolveUnitSelection("casa-b", units), "casa-b");
  assert.equal(resolveUnitSelection("casa-fora-do-acesso", units), "casa-a");
});

test("sem casas autorizadas não cria escopo global", () => {
  assert.equal(resolveUnitSelection(ALL_UNITS, []), null);
  assert.equal(resolveUnitSelection("casa-a", []), null);
});

test("primeiro acesso preserva o padrão existente", () => {
  assert.equal(resolveUnitSelection(undefined, units), "casa-a");
});
