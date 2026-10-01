import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parsePreflightReport,
  runReadOnlyPreflight,
} from "./preflight.mjs";
import { SOURCE_PROJECT_REF, TARGET_PROJECT_REF } from "./policy.mjs";

const EXPECTATIONS = {
  cartographyVersions: 2,
  sections: 7052,
  municipalities: 125,
  localDistricts: 45,
  federalDistricts: 40,
  ecegSections: 7052,
  nominalRows: 7052,
};

function manifest() {
  return {
    source: { projectRef: SOURCE_PROJECT_REF },
    target: { projectRef: TARGET_PROJECT_REF },
    expectations: { ...EXPECTATIONS },
  };
}

function report(projectRef, overrides = {}) {
  return {
    contractVersion: 1,
    kind: "promotion_preflight",
    projectRef,
    identity: {
      database: "postgres",
      postgresVersionNumber: 170011,
      region: "us-east-1",
    },
    extensions: [{ name: "postgis", version: "3.5.2" }],
    databaseSizeBytes: 1024,
    userTables: [],
    migrationHistory: { exists: false, rows: 0 },
    counts: { ...EXPECTATIONS },
    ...overrides,
  };
}

function compatibility(overrides = {}) {
  return {
    contractVersion: 1,
    kind: "promotion_pg17_compatibility",
    ltreeIndexes: [],
    btreeGistFloatIndexes: [],
    legacyCipherReferences: [],
    customEstimatorOperators: [],
    blockingIssues: [],
    ...overrides,
  };
}

function dependencies({ projectRef, docker = true, reportOverrides, compatibilityOverrides } = {}) {
  const calls = { audit: 0, docker: 0, psql: 0, query: [] };
  return {
    calls,
    auditMigrations: async () => {
      calls.audit += 1;
      return { passed: true, errors: [], warnings: [], exceptionsUsed: [] };
    },
    dockerHealth: async () => {
      calls.docker += 1;
      return { available: docker, detail: docker ? "healthy" : "daemon unavailable" };
    },
    psqlHealth: async () => {
      calls.psql += 1;
      return { available: true, detail: "17.11" };
    },
    queryProject: async ({ sqlFile }) => {
      calls.query.push(sqlFile);
      const payload = sqlFile.endsWith("promotion_preflight.sql")
        ? report(projectRef, reportOverrides)
        : compatibility(compatibilityOverrides);
      return { exitCode: 0, stdout: JSON.stringify(payload), stderr: "" };
    },
  };
}

test("parses one strict JSON report and rejects noise or another contract", () => {
  const value = report(SOURCE_PROJECT_REF);
  assert.deepEqual(parsePreflightReport(JSON.stringify(value), "promotion_preflight"), value);
  assert.throws(
    () => parsePreflightReport(`notice\n${JSON.stringify(value)}`, "promotion_preflight"),
    /single JSON/iu,
  );
  assert.throws(
    () => parsePreflightReport(JSON.stringify({ ...value, contractVersion: 2 }), "promotion_preflight"),
    /contract/iu,
  );
});

test("parses the single-row wrapper returned by Supabase db query", () => {
  const value = report(SOURCE_PROJECT_REF);
  const wrapped = { rows: [{ jsonb_build_object: value }] };
  assert.deepEqual(
    parsePreflightReport(JSON.stringify(wrapped), "promotion_preflight"),
    value,
  );
});

test("runs every read-only dependency once and isolates missing Docker to data", async () => {
  const deps = dependencies({ projectRef: TARGET_PROJECT_REF, docker: false });
  const result = await runReadOnlyPreflight({
    role: "target",
    projectRef: TARGET_PROJECT_REF,
    manifest: manifest(),
    migrationDir: "migrations",
    exceptions: [],
    dependencies: deps,
  });

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.schemaSimulation.status, "PASSED");
  assert.equal(result.dataTransfer.status, "BLOCKED");
  assert.deepEqual(
    { audit: deps.calls.audit, docker: deps.calls.docker, psql: deps.calls.psql },
    { audit: 1, docker: 1, psql: 1 },
  );
  assert.equal(deps.calls.query.length, 2);
  assert.match(deps.calls.query[0], /promotion_preflight\.sql$/u);
  assert.match(deps.calls.query[1], /promotion_pg17_compatibility\.sql$/u);
  assert.ok(result.issues.some(({ code }) => code === "DOCKER_UNAVAILABLE"));
});

test("blocks a source whose territorial objects or manifest counts drift", async () => {
  const deps = dependencies({
    projectRef: SOURCE_PROJECT_REF,
    reportOverrides: {
      userTables: ["territorios_secciones"],
      counts: { ...EXPECTATIONS, sections: 7051 },
      migrationHistory: { exists: true, rows: 49 },
    },
  });
  const result = await runReadOnlyPreflight({
    role: "source",
    projectRef: SOURCE_PROJECT_REF,
    manifest: manifest(),
    migrationDir: "migrations",
    exceptions: [],
    dependencies: deps,
  });

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.some(({ code }) => code === "SOURCE_OBJECT_MISSING"));
  assert.ok(result.issues.some(({ code }) => code === "SOURCE_COUNT_MISMATCH"));
});

test("blocks a non-empty target and any PostgreSQL 17 compatibility issue", async () => {
  const deps = dependencies({
    projectRef: TARGET_PROJECT_REF,
    reportOverrides: {
      userTables: ["already_here"],
      migrationHistory: { exists: true, rows: 1 },
    },
    compatibilityOverrides: { blockingIssues: ["legacy_cipher"] },
  });
  const result = await runReadOnlyPreflight({
    role: "target",
    projectRef: TARGET_PROJECT_REF,
    manifest: manifest(),
    migrationDir: "migrations",
    exceptions: [],
    dependencies: deps,
  });

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.issues.some(({ code }) => code === "TARGET_NOT_EMPTY"));
  assert.ok(result.issues.some(({ code }) => code === "PG17_COMPATIBILITY"));
});

test("converts dependency failures into BLOCKED without retries", async () => {
  const calls = { audit: 0, docker: 0, psql: 0, query: 0 };
  const result = await runReadOnlyPreflight({
    role: "target",
    projectRef: TARGET_PROJECT_REF,
    manifest: manifest(),
    migrationDir: "migrations",
    exceptions: [],
    dependencies: {
      auditMigrations: async () => {
        calls.audit += 1;
        throw new Error("audit unavailable");
      },
      dockerHealth: async () => {
        calls.docker += 1;
        throw new Error("docker unavailable");
      },
      psqlHealth: async () => {
        calls.psql += 1;
        throw new Error("psql unavailable");
      },
      queryProject: async () => {
        calls.query += 1;
        throw new Error("probe unavailable");
      },
    },
  });

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(calls, { audit: 1, docker: 1, psql: 1, query: 2 });
  assert.ok(result.issues.some(({ code }) => code === "MIGRATION_AUDIT_FAILED"));
  assert.ok(result.issues.some(({ code }) => code === "DOCKER_UNAVAILABLE"));
  assert.ok(result.issues.some(({ code }) => code === "PSQL_UNAVAILABLE"));
  assert.equal(result.issues.filter(({ code }) => code === "PROBE_FAILED").length, 2);
});

test("ships two single-statement read-only probes with the required signals", async () => {
  for (const [file, signals] of [
    [
      "infra/territorial/supabase/tests/promotion_preflight.sql",
      ["current_database", "server_version", "database_size", "user_table", "migration_history", "counts"],
    ],
    [
      "infra/territorial/supabase/tests/promotion_pg17_compatibility.sql",
      ["ltree", "btree_gist", "legacy_cipher", "custom_estimator"],
    ],
  ]) {
    const sql = await readFile(file, "utf8");
    assert.match(sql, /^\s*(?:with\b|select\b)/iu);
    assert.doesNotMatch(
      sql.replace(/--.*$/gmu, ""),
      /\b(?:insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|call|do|copy)\b/iu,
    );
    assert.equal((sql.match(/;\s*(?:--[^\n]*)?(?=\s*$)/gu) ?? []).length, 1);
    for (const signal of signals) assert.match(sql.toLowerCase(), new RegExp(signal, "u"));
  }
});
