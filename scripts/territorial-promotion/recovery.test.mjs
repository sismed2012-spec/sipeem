import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import policy from "../../infra/territorial/data-policy.json" with { type: "json" };
import { createRecoveryJournal, transitionJournal } from "./journal.mjs";
import { SOURCE_PROJECT_REF, TARGET_PROJECT_REF } from "./policy.mjs";
import { adoptRecoverySchema, runRecoveryPreflight } from "./recovery.mjs";

const HASH = "a".repeat(64);
const MIGRATIONS = Array.from({ length: 49 }, (_, index) => ({
  path: `infra/territorial/supabase/migrations/${String(20260901000000 + index)}_migration.sql`,
  sha256: HASH,
}));
const VERSIONS = MIGRATIONS.map(({ path }) => path.split("/").at(-1).slice(0, 14));

function manifest() {
  return {
    contractVersion: 2,
    mode: "DATA_RECOVERY",
    manifestSha256: "b".repeat(64),
    sourceCommit: "c".repeat(40),
    source: { projectRef: SOURCE_PROJECT_REF },
    target: { projectRef: TARGET_PROJECT_REF },
    migrations: structuredClone(MIGRATIONS),
    dataPolicy: structuredClone(policy),
    recovery: { predecessorManifestSha256: "d".repeat(64) },
  };
}

function schemaReport(overrides = {}) {
  return {
    contractVersion: 1,
    kind: "promotion_schema_postflight",
    migrationVersions: [...VERSIONS],
    extensions: ["btree_gist", "pgcrypto", "postgis", "vector"],
    missingRequiredObjects: [],
    territorialObjectCount: 82,
    rlsViolations: [],
    privilegeViolations: [],
    functionViolations: [],
    operationalObjects: [],
    ...overrides,
  };
}

function identityReport(overrides = {}) {
  return {
    contractVersion: 1,
    kind: "promotion_preflight",
    projectRef: TARGET_PROJECT_REF,
    identity: { database: "postgres", postgresVersionNumber: 170011, region: "us-east-1" },
    ...overrides,
  };
}

function compatibilityReport(overrides = {}) {
  return {
    contractVersion: 1,
    kind: "promotion_pg17_compatibility",
    blockingIssues: [],
    ...overrides,
  };
}

function absenceReport(overrides = {}) {
  return {
    contractVersion: 1,
    kind: "promotion_recovery_absence",
    tables: policy.include.map(({ table }) => ({ table, rowCount: 0 })),
    ...overrides,
  };
}

function preseededReport(overrides = {}) {
  return {
    contractVersion: 1,
    kind: "promotion_preseeded_catalogs",
    tables: policy.preseeded.map(({ table, ownedSequences }) => ({
      table,
      rowCount: 2,
      rowsSha256: "e".repeat(64),
      sequences: ownedSequences.map((name) => ({ name, lastValue: 2, isCalled: true })),
    })),
    ...overrides,
  };
}

function dependencies(overrides = {}) {
  const calls = { audit: 0, docker: 0, psql: 0, query: [], write: 0, persisted: [] };
  const reports = {
    identity: identityReport(),
    compatibility: compatibilityReport(),
    schema: schemaReport(),
    absence: absenceReport(),
    sourcePreseeded: preseededReport(),
    targetPreseeded: preseededReport(),
    ...(overrides.reports ?? {}),
  };
  return {
    calls,
    auditMigrations: async () => {
      calls.audit += 1;
      return { passed: true, errors: [], warnings: [] };
    },
    dockerHealth: async () => {
      calls.docker += 1;
      return { available: true, detail: "healthy" };
    },
    psqlHealth: async () => {
      calls.psql += 1;
      return { available: true, detail: "17.11" };
    },
    validateLocalHashes: async () => ({ valid: true, mismatches: [] }),
    queryProject: async ({ projectRef, sqlFile }) => {
      calls.query.push({ projectRef, sqlFile });
      let payload;
      if (sqlFile.endsWith("promotion_preflight.sql")) payload = reports.identity;
      else if (sqlFile.endsWith("promotion_pg17_compatibility.sql")) payload = reports.compatibility;
      else if (sqlFile.endsWith("promotion_schema_postflight.sql")) payload = reports.schema;
      else if (sqlFile.endsWith("promotion_recovery_absence.sql")) payload = reports.absence;
      else if (sqlFile.endsWith("promotion_preseeded_catalogs.sql")) {
        payload = projectRef === SOURCE_PROJECT_REF
          ? reports.sourcePreseeded
          : reports.targetPreseeded;
      } else throw new Error(`Unexpected probe ${sqlFile}`);
      return { exitCode: 0, stdout: JSON.stringify(payload), stderr: "" };
    },
    runProcessOnce: async () => {
      calls.write += 1;
      throw new Error("write runner must not be invoked");
    },
    persistJournal: async (journal) => calls.persisted.push(structuredClone(journal)),
    ...overrides.dependencies,
  };
}

function preflightJournal(value = manifest()) {
  const created = createRecoveryJournal({
    manifestSha256: value.manifestSha256,
    sourceCommit: value.sourceCommit,
    sourceRef: value.source.projectRef,
    targetRef: value.target.projectRef,
    predecessorManifestSha256: value.recovery.predecessorManifestSha256,
  });
  return transitionJournal(created, { to: "PREFLIGHT_PASSED", evidenceSha256: HASH });
}

test("passes only the exact adopted schema, empty canonical tables, and preseeded parity", async () => {
  const deps = dependencies();
  const result = await runRecoveryPreflight({
    manifest: manifest(),
    migrationDir: "infra/territorial/supabase/migrations",
    exceptions: [],
    dependencies: deps,
  });

  assert.equal(result.status, "PASSED");
  assert.equal(result.issues.length, 0);
  assert.match(result.evidenceSha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(
    deps.calls.query.map(({ projectRef }) => projectRef),
    [TARGET_PROJECT_REF, TARGET_PROJECT_REF, TARGET_PROJECT_REF, TARGET_PROJECT_REF, SOURCE_PROJECT_REF, TARGET_PROJECT_REF],
  );
  assert.equal(deps.calls.write, 0);
});

test("blocks every schema-adoption failure class without a database write", async () => {
  const cases = [
    ["missing migration", { schema: schemaReport({ migrationVersions: VERSIONS.slice(1) }) }, "MIGRATION_HISTORY_MISMATCH"],
    ["missing extension", { schema: schemaReport({ extensions: ["pgcrypto", "postgis", "vector"] }) }, "EXTENSION_MISSING"],
    ["missing object", { schema: schemaReport({ missingRequiredObjects: ["public.territorios_secciones"] }) }, "REQUIRED_OBJECT_MISSING"],
    ["object count drift", { schema: schemaReport({ territorialObjectCount: 81 }) }, "TERRITORIAL_OBJECT_COUNT_MISMATCH"],
    ["RLS", { schema: schemaReport({ rlsViolations: ["bad"] }) }, "RLS_VIOLATION"],
    ["privilege", { schema: schemaReport({ privilegeViolations: ["bad"] }) }, "PRIVILEGE_VIOLATION"],
    ["function", { schema: schemaReport({ functionViolations: ["bad"] }) }, "FUNCTION_VIOLATION"],
    ["operational", { schema: schemaReport({ operationalObjects: ["public.usuarios"] }) }, "OPERATIONAL_OBJECT_PRESENT"],
    ["canonical data", { absence: absenceReport({ tables: policy.include.map(({ table }, index) => ({ table, rowCount: index === 0 ? 1 : 0 })) }) }, "CANONICAL_DATA_PRESENT"],
    ["preseeded", { targetPreseeded: preseededReport({ tables: policy.preseeded.map(({ table, ownedSequences }, index) => ({ table, rowCount: index === 0 ? 3 : 2, rowsSha256: "e".repeat(64), sequences: ownedSequences.map((name) => ({ name, lastValue: 2, isCalled: true })) })) }) }, "ROW_COUNT_MISMATCH"],
  ];

  for (const [name, reports, expectedCode] of cases) {
    const deps = dependencies({ reports });
    const result = await runRecoveryPreflight({
      manifest: manifest(),
      migrationDir: "infra/territorial/supabase/migrations",
      exceptions: [],
      dependencies: deps,
    });
    assert.equal(result.status, "BLOCKED", name);
    assert.ok(result.issues.some(({ code }) => code === expectedCode), name);
    assert.equal(deps.calls.write, 0, name);
  }
});

test("adopts schema with two durable local transitions and no remote write", async () => {
  const value = manifest();
  const deps = dependencies();
  const result = await adoptRecoverySchema({
    manifest: value,
    journal: preflightJournal(value),
    migrationDir: "infra/territorial/supabase/migrations",
    exceptions: [],
    dependencies: deps,
  });

  assert.equal(result.status, "PASSED");
  assert.equal(result.journal.state, "SCHEMA_APPLIED");
  assert.deepEqual(deps.calls.persisted.map(({ state }) => state), ["SCHEMA_ADOPTING", "SCHEMA_APPLIED"]);
  assert.equal(deps.calls.write, 0);
});

test("blocks adoption on a probe failure without retry or repair", async () => {
  const value = manifest();
  const deps = dependencies({
    dependencies: {
      queryProject: async ({ sqlFile }) => {
        deps.calls.query.push({ projectRef: TARGET_PROJECT_REF, sqlFile });
        throw new Error("probe unavailable");
      },
    },
  });
  const result = await adoptRecoverySchema({
    manifest: value,
    journal: preflightJournal(value),
    migrationDir: "infra/territorial/supabase/migrations",
    exceptions: [],
    dependencies: deps,
  });

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.journal.state, "BLOCKED");
  assert.deepEqual(deps.calls.persisted.map(({ state }) => state), ["SCHEMA_ADOPTING", "BLOCKED"]);
  assert.equal(deps.calls.write, 0);
});

test("absence SQL is one read-only statement with exactly the policy include set", async () => {
  const sql = await readFile("infra/territorial/supabase/tests/promotion_recovery_absence.sql", "utf8");
  assert.match(sql, /^\s*(?:with\b|select\b)/iu);
  assert.doesNotMatch(sql.replace(/--.*$/gmu, ""), /\b(?:insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|call|do|copy)\b/iu);
  assert.equal((sql.match(/;\s*(?:--[^\n]*)?(?=\s*$)/gu) ?? []).length, 1);
  const names = [...sql.matchAll(/'((?:public\.)[a-z_][a-z0-9_]*)'/gu)]
    .map((match) => match[1])
    .filter((name) => name !== "public.placeholder")
    .sort();
  assert.deepEqual([...new Set(names)], policy.include.map(({ table }) => table).sort());
});
