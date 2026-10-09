import assert from "node:assert/strict";
import test from "node:test";
import { parseUnitScope, resolveUnitScope, requiredUnitScope } from "../src/lib/compras/unit-scope";

test("HOS preserves its legacy PostgreSQL UUID instead of becoming all houses", () => {
  const hos = "00000000-0000-0000-0000-000000000010";
  assert.equal(parseUnitScope(hos), hos);
  assert.equal(resolveUnitScope(hos, [hos]), hos);
  assert.equal(requiredUnitScope.parse(hos), hos);
});
