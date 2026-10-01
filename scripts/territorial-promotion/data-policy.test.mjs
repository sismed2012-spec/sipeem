import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  classifySourceTables,
  computeInventoryFingerprint,
} from "./data-policy.mjs";
import { SOURCE_PROJECT_REF } from "./policy.mjs";

const REQUIRED_EXCLUSIONS = [
  "public.staging_electoral_incidencias",
  "public.staging_electoral_registros",
  "public.staging_electoral_resultados",
];

function inventory(names = ["public.parent", "public.child", ...REQUIRED_EXCLUSIONS], foreignKeys = []) {
  return {
    contractVersion: 1,
    sourceProjectRef: SOURCE_PROJECT_REF,
    kind: "promotion_data_inventory",
    tables: names.map((name) => ({ name, estimatedRows: 0, totalBytes: 0 })),
    foreignKeys,
    sequences: [],
    dependencies: [],
  };
}

function policy(sourceInventory, overrides = {}) {
  return {
    contractVersion: 1,
    sourceProjectRef: SOURCE_PROJECT_REF,
    sourceInventorySha256: computeInventoryFingerprint(sourceInventory),
    include: [
      { table: "public.parent", reason: "Territorial canonical data." },
      { table: "public.child", reason: "Territorial dependent data." },
    ],
    exclude: REQUIRED_EXCLUSIONS.map((table) => ({
      table,
      reason: "Transient validation staging; reproducible from canonical source files.",
      documentedIncomingDependencies: [],
    })),
    ...overrides,
  };
}

test("classifies every observed public table exactly once", () => {
  const sourceInventory = inventory();
  const result = classifySourceTables({
    inventory: sourceInventory,
    dataPolicy: policy(sourceInventory),
  });

  assert.deepEqual(result.include, ["public.child", "public.parent"]);
  assert.deepEqual(result.exclude, [...REQUIRED_EXCLUSIONS].sort());
  assert.equal(result.inventorySha256, computeInventoryFingerprint(sourceInventory));
});

test("inventory fingerprint pins structure but ignores volatile size estimates", () => {
  const sourceInventory = inventory();
  const changedStatistics = structuredClone(sourceInventory);
  changedStatistics.tables[0].estimatedRows = 999;
  changedStatistics.tables[0].totalBytes = 123456;
  assert.equal(
    computeInventoryFingerprint(changedStatistics),
    computeInventoryFingerprint(sourceInventory),
  );
});

test("blocks duplicate, unknown, missing, or fingerprint-drifted policy entries", () => {
  const sourceInventory = inventory();
  const base = policy(sourceInventory);
  for (const [candidate, expected] of [
    [{ ...base, include: [...base.include, base.include[0]] }, /duplicate/iu],
    [{ ...base, include: [...base.include, { table: "public.unknown", reason: "No." }] }, /unknown/iu],
    [{ ...base, include: base.include.slice(1) }, /missing/iu],
    [{ ...base, sourceInventorySha256: "f".repeat(64) }, /fingerprint/iu],
    [{ ...base, sourceProjectRef: "xvdqlozimvqluwxpbizx" }, /source project/iu],
  ]) {
    assert.throws(
      () => classifySourceTables({ inventory: sourceInventory, dataPolicy: candidate }),
      expected,
    );
  }
});

test("requires the three electoral staging tables to remain excluded with reasons", () => {
  const sourceInventory = inventory();
  const base = policy(sourceInventory);
  const moved = {
    ...base,
    include: [...base.include, base.exclude[0]],
    exclude: base.exclude.slice(1),
  };
  assert.throws(
    () => classifySourceTables({ inventory: sourceInventory, dataPolicy: moved }),
    /required exclusion/iu,
  );
  const noReason = {
    ...base,
    exclude: base.exclude.map((entry, index) =>
      index === 0 ? { ...entry, reason: "" } : entry,
    ),
  };
  assert.throws(
    () => classifySourceTables({ inventory: sourceInventory, dataPolicy: noReason }),
    /reason/iu,
  );
});

test("blocks an included-to-excluded FK until the dependency is documented", () => {
  const sourceInventory = inventory(undefined, [
    {
      name: "child_parent_fk",
      fromTable: "public.child",
      toTable: "public.staging_electoral_registros",
    },
  ]);
  const base = policy(sourceInventory);
  assert.throws(
    () => classifySourceTables({ inventory: sourceInventory, dataPolicy: base }),
    /foreign key/iu,
  );

  const documented = {
    ...base,
    exclude: base.exclude.map((entry) =>
      entry.table === "public.staging_electoral_registros"
        ? {
            ...entry,
            documentedIncomingDependencies: [
              {
                fromTable: "public.child",
                constraint: "child_parent_fk",
                reason: "The child value is normalized before promotion and the staging FK is not restored.",
              },
            ],
          }
        : entry,
    ),
  };
  assert.doesNotThrow(() =>
    classifySourceTables({ inventory: sourceInventory, dataPolicy: documented }),
  );
});

test("pins the reviewed SIPEEM-DEV inventory policy", async () => {
  const reviewed = JSON.parse(
    await readFile("infra/territorial/data-policy.json", "utf8"),
  );
  assert.equal(reviewed.sourceInventorySha256, "5f6199fd6d1de9036149afabf6b377e395c460b3c8c30641aac48ef7c988d9d9");
  assert.equal(reviewed.sourceSnapshot.tableCount, 66);
  assert.equal(reviewed.include.length, 63);
  assert.deepEqual(
    reviewed.exclude.map(({ table }) => table).sort(),
    [...REQUIRED_EXCLUSIONS].sort(),
  );
  const names = [...reviewed.include, ...reviewed.exclude].map(({ table }) => table);
  assert.equal(new Set(names).size, 66);
});

test("ships one read-only inventory statement with structural and sizing signals", async () => {
  const sql = await readFile(
    "infra/territorial/supabase/tests/promotion_data_inventory.sql",
    "utf8",
  );
  assert.match(sql, /^\s*(?:with\b|select\b)/iu);
  assert.doesNotMatch(
    sql.replace(/--.*$/gmu, ""),
    /\b(?:insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|call|do|copy)\b/iu,
  );
  assert.equal((sql.match(/;\s*(?=\s*$)/gu) ?? []).length, 1);
  for (const signal of ["total_relation_size", "reltuples", "constraint", "sequences", "dependencies"]) {
    assert.match(sql.toLowerCase(), new RegExp(signal, "u"));
  }
});
