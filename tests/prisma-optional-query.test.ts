import { test } from "node:test";
import assert from "node:assert/strict";
import { optionalPrismaQuery } from "../src/lib/compras/prisma-optional-query";

test("optional timeout keeps core result and exposes unknown diagnostic with warning", async () => {
  const timeout = new Error("statement timeout");
  const logged: unknown[] = [];
  const [core, optional] = await Promise.all([
    Promise.resolve({ receita: 100, cmv: 28 }),
    optionalPrismaQuery(
      async () => {
        throw timeout;
      },
      "Disponibilidade a validar",
      (e) => logged.push(e),
    ),
  ]);
  assert.equal(core.cmv, 28);
  assert.deepEqual(optional, {
    rows: [],
    warning: "Disponibilidade a validar",
  });
  assert.deepEqual(logged, [timeout]);
});

test("successful optional query preserves rows including unknown values", async () => {
  const rows = [{ dias: null }, { dias: 7 }];
  const result = await optionalPrismaQuery(
    async () => rows,
    "A validar",
    () => {
      throw new Error("unexpected failure");
    },
  );
  assert.deepEqual(result, { rows, warning: null });
});
