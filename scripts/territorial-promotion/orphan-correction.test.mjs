import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = "infra/territorial/supabase/corrections";

test("ships read-only preflight and postflight probes for the exact orphan correction", async () => {
  for (const phase of ["preflight", "postflight"]) {
    const sql = await readFile(`${ROOT}/resultado_staging_orphans_${phase}.sql`, "utf8");
    assert.match(sql, /^\s*(?:with|select)\b/iu);
    assert.doesNotMatch(
      sql.replace(/--.*$/gmu, ""),
      /\b(?:insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|call|do|copy)\b/iu,
    );
    assert.match(sql, /resultados_municipales_oficiales_fuerzas/iu);
    assert.match(sql, /staging_electoral_resultados/iu);
    assert.match(sql, new RegExp(`'phase',\\s*'${phase}'`, "iu"));
  }
});

test("correction updates exactly 2280 orphan pointers and cannot delete canonical rows", async () => {
  const sql = await readFile(`${ROOT}/resultado_staging_orphans_apply_once.sql`, "utf8");
  assert.match(sql, /^\s*do\s+\$/iu);
  assert.match(sql, /expected 2280 orphan references/iu);
  assert.match(sql, /get diagnostics\s+updated_rows\s*=\s*row_count/iu);
  assert.match(sql, /set\s+resultado_staging_id\s*=\s*null/iu);
  assert.match(sql, /not exists/iu);
  assert.doesNotMatch(sql.replace(/--.*$/gmu, ""), /\bdelete\b/iu);
  assert.equal((sql.match(/\bupdate\b/giu) ?? []).length, 1);
});
