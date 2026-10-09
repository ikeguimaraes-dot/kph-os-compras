// Print a read-only PostgreSQL regression query using the exact migration SQL.
// Execute the output with Supabase execute_sql; every result must have pass=true.
import { readFileSync } from "node:fs";
const migration = readFileSync("supabase/migrations/20261009051237_prisma_mapa_preco_fallback.sql", "utf8");
const calculation = migration.split("WITH (security_invoker = true) AS\n")[1]?.split(";\n")[0];
if (!calculation) throw new Error("Calculation not found in migration");
const fixture = readFileSync("tests/fixtures/prisma-mapa-preco.sql", "utf8");
process.stdout.write(fixture.replace("/* CALCULATION */", calculation.replaceAll("public.", "")));
