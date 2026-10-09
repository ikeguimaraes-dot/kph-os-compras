import { test } from "node:test";
import assert from "node:assert/strict";
import { ZodError } from "zod";
import { parseUnitScope, unitScope, requiredUnitScope, resolveUnitScope } from "../src/lib/compras/unit-scope";

const meet = "674eac8c-5a38-4a42-aa60-0a666387909b";
const outside = "11111111-1111-4111-8111-111111111111";

test("escopos de navegação nunca provocam ZodError", () => {
  for (const value of ["all", "", "HOS", "null", null, undefined, 42, {}, []]) {
    assert.equal(parseUnitScope(value), null);
    assert.equal(unitScope.parse(value), null);
  }
  assert.equal(unitScope.parse(meet), meet);
});

test("UUID fora das casas de CMV vira leitura do grupo autorizado", () => {
  assert.equal(parseUnitScope(outside), outside);
  assert.equal(resolveUnitScope(outside, [meet]), null);
  assert.equal(resolveUnitScope(meet, [meet]), meet);
  assert.equal(resolveUnitScope(meet, []), null);
});

test("gravação individual exige casa e devolve orientação sem ZodError", () => {
  for (const value of ["all", "", null, "HOS"]) {
    assert.throws(() => requiredUnitScope.parse(value), (error: unknown) =>
      error instanceof Error && !(error instanceof ZodError) && error.message.includes("casa específica"));
  }
  assert.equal(requiredUnitScope.parse(meet), meet);
});
