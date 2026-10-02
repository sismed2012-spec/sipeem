import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { auditMigrations } from "./migration-audit.mjs";
import { transitionJournal, validateJournal } from "./journal.mjs";
import { comparePreseededReports, parsePreseededReport } from "./preseeded.mjs";
import {
  captureDependency,
  defaultDockerHealth,
  defaultPsqlHealth,
  defaultQueryProject,
  parsePreflightReport,
} from "./preflight.mjs";
import { assertProjectRole } from "./policy.mjs";
import { redactSensitiveText } from "./process.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const REQUIRED_EXTENSIONS = ["btree_gist", "pgcrypto", "postgis", "vector"];
const EXPECTED_TERRITORIAL_OBJECTS = 82;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function evidence(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function issue(code, detail) {
  return { code, detail: redactSensitiveText(String(detail ?? "")) };
}

function expectedIdentity(manifest) {
  return {
    manifestSha256: manifest.manifestSha256,
    sourceCommit: manifest.sourceCommit,
    sourceRef: manifest.source?.projectRef,
    targetRef: manifest.target?.projectRef,
    mode: "DATA_RECOVERY",
    predecessorManifestSha256: manifest.recovery?.predecessorManifestSha256,
  };
}

function assertRecoveryManifest(manifest) {
  if (
    manifest?.contractVersion !== 2 ||
    manifest?.mode !== "DATA_RECOVERY" ||
    !SHA256.test(manifest?.manifestSha256 ?? "") ||
    !SHA256.test(manifest?.recovery?.predecessorManifestSha256 ?? "")
  ) {
    throw new Error("Recovery preflight requires a contract-v2 DATA_RECOVERY manifest");
  }
  assertProjectRole({ projectRef: manifest.source?.projectRef, role: "source", access: "read" });
  assertProjectRole({ projectRef: manifest.target?.projectRef, role: "target", access: "read" });
  if (!Array.isArray(manifest.migrations) || manifest.migrations.length !== 49) {
    throw new Error("Recovery preflight requires exactly 49 migrations");
  }
  if (!Array.isArray(manifest.dataPolicy?.include) || !Array.isArray(manifest.dataPolicy?.preseeded)) {
    throw new Error("Recovery preflight requires reviewed data policy metadata");
  }
}

function migrationVersions(manifest) {
  return manifest.migrations.map(({ path: migrationPath }) =>
    path.posix.basename(String(migrationPath).replaceAll("\\", "/")).slice(0, 14),
  );
}

async function validateLocalHashes(manifest, repoRoot) {
  const mismatches = [];
  for (const migration of manifest.migrations) {
    try {
      const bytes = await readFile(path.resolve(repoRoot, migration.path));
      const actual = createHash("sha256").update(bytes).digest("hex");
      if (!SHA256.test(migration.sha256 ?? "") || actual !== migration.sha256) {
        mismatches.push(migration.path);
      }
    } catch {
      mismatches.push(migration.path);
    }
  }
  return { valid: mismatches.length === 0, mismatches };
}

function parseQuery(result, kind, issues) {
  if (!result || result.exitCode !== 0) {
    issues.push(issue("PROBE_FAILED", `${kind}:${result?.errorCode ?? "QUERY_FAILED"}`));
    return null;
  }
  try {
    return parsePreflightReport(result.stdout, kind);
  } catch (error) {
    issues.push(issue("PROBE_INVALID", `${kind}:${error.message}`));
    return null;
  }
}

function parsePreseededQuery(result, label, issues) {
  if (!result || result.exitCode !== 0) {
    issues.push(issue("PROBE_FAILED", `${label}:${result?.errorCode ?? "QUERY_FAILED"}`));
    return null;
  }
  try {
    return parsePreseededReport(result.stdout);
  } catch (error) {
    issues.push(issue("PROBE_INVALID", `${label}:${error.message}`));
    return null;
  }
}

function validateIdentity(report, targetRef, issues) {
  if (report.projectRef && report.projectRef !== targetRef) {
    issues.push(issue("PROJECT_IDENTITY_MISMATCH", report.projectRef));
  }
  if (
    report.identity?.database !== "postgres" ||
    !Number.isSafeInteger(report.identity?.postgresVersionNumber) ||
    report.identity.postgresVersionNumber < 170000
  ) {
    issues.push(issue("DATABASE_IDENTITY_INVALID", "Expected PostgreSQL 17 postgres database"));
  }
}

function validateSchema(report, manifest, localHashes, issues) {
  if (!localHashes?.valid) {
    issues.push(issue("LOCAL_HASH_MISMATCH", (localHashes?.mismatches ?? []).join(",")));
  }
  const expectedVersions = migrationVersions(manifest);
  if (JSON.stringify(report.migrationVersions ?? null) !== JSON.stringify(expectedVersions)) {
    issues.push(issue("MIGRATION_HISTORY_MISMATCH", "Expected exact ordered migration history"));
  }
  const installed = new Set(report.extensions ?? []);
  for (const extension of REQUIRED_EXTENSIONS) {
    if (!installed.has(extension)) issues.push(issue("EXTENSION_MISSING", extension));
  }
  for (const [field, code] of [
    ["missingRequiredObjects", "REQUIRED_OBJECT_MISSING"],
    ["rlsViolations", "RLS_VIOLATION"],
    ["privilegeViolations", "PRIVILEGE_VIOLATION"],
    ["functionViolations", "FUNCTION_VIOLATION"],
    ["operationalObjects", "OPERATIONAL_OBJECT_PRESENT"],
  ]) {
    if (!Array.isArray(report[field]) || report[field].length > 0) {
      issues.push(issue(code, JSON.stringify(report[field] ?? null)));
    }
  }
  if (report.territorialObjectCount !== EXPECTED_TERRITORIAL_OBJECTS) {
    issues.push(
      issue(
        "TERRITORIAL_OBJECT_COUNT_MISMATCH",
        `Expected ${EXPECTED_TERRITORIAL_OBJECTS}, received ${String(report.territorialObjectCount)}`,
      ),
    );
  }
}

function validateAbsence(report, expectedTables, issues) {
  const expected = expectedTables.map(({ table }) => table).sort();
  const actual = Array.isArray(report?.tables)
    ? report.tables.map(({ table }) => table).sort()
    : [];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    issues.push(issue("ABSENCE_TABLE_SET_MISMATCH", "Canonical table set does not match policy"));
    return;
  }
  for (const entry of report.tables) {
    if (!Number.isSafeInteger(entry.rowCount) || entry.rowCount < 0) {
      issues.push(issue("ABSENCE_REPORT_INVALID", entry.table));
    } else if (entry.rowCount !== 0) {
      issues.push(issue("CANONICAL_DATA_PRESENT", entry.table));
    }
  }
}

async function queryCaptured(queryProject, options) {
  return captureDependency(
    () => queryProject(options),
    (detail) => ({ exitCode: null, stdout: "", stderr: "", errorCode: `PROBE_ERROR:${detail}` }),
  );
}

export async function runRecoveryPreflight({
  manifest,
  migrationDir,
  exceptions,
  repoRoot = process.cwd(),
  dependencies = {},
}) {
  assertRecoveryManifest(manifest);
  const deps = {
    auditMigrations,
    dockerHealth: defaultDockerHealth,
    psqlHealth: defaultPsqlHealth,
    queryProject: defaultQueryProject,
    validateLocalHashes: (value) => validateLocalHashes(value, repoRoot),
    ...dependencies,
  };
  const [audit, docker, psql, localHashes] = await Promise.all([
    captureDependency(
      () => deps.auditMigrations({ migrationDir, exceptions }),
      (detail) => ({ passed: false, errors: [{ message: detail }] }),
    ),
    captureDependency(() => deps.dockerHealth(), (detail) => ({ available: false, detail })),
    captureDependency(() => deps.psqlHealth(), (detail) => ({ available: false, detail })),
    captureDependency(
      () => deps.validateLocalHashes(manifest),
      (detail) => ({ valid: false, mismatches: [detail] }),
    ),
  ]);

  const targetRef = manifest.target.projectRef;
  const sourceRef = manifest.source.projectRef;
  const targetFiles = [
    "infra/territorial/supabase/tests/promotion_preflight.sql",
    "infra/territorial/supabase/tests/promotion_pg17_compatibility.sql",
    "infra/territorial/supabase/tests/promotion_schema_postflight.sql",
    "infra/territorial/supabase/tests/promotion_recovery_absence.sql",
  ];
  const targetResults = [];
  for (const sqlFile of targetFiles) {
    targetResults.push(await queryCaptured(deps.queryProject, { projectRef: targetRef, sqlFile, repoRoot }));
  }
  const sourcePreseeded = await queryCaptured(deps.queryProject, {
    projectRef: sourceRef,
    sqlFile: "infra/territorial/supabase/tests/promotion_preseeded_catalogs.sql",
    repoRoot,
  });
  const targetPreseeded = await queryCaptured(deps.queryProject, {
    projectRef: targetRef,
    sqlFile: "infra/territorial/supabase/tests/promotion_preseeded_catalogs.sql",
    repoRoot,
  });

  const issues = [];
  if (!audit?.passed) issues.push(issue("MIGRATION_AUDIT_FAILED", `${audit?.errors?.length ?? 0} error(s)`));
  if (!docker?.available) issues.push(issue("DOCKER_UNAVAILABLE", docker?.detail ?? "unavailable"));
  if (!psql?.available) issues.push(issue("PSQL_UNAVAILABLE", psql?.detail ?? "unavailable"));

  const identity = parseQuery(targetResults[0], "promotion_preflight", issues);
  const compatibility = parseQuery(targetResults[1], "promotion_pg17_compatibility", issues);
  const schema = parseQuery(targetResults[2], "promotion_schema_postflight", issues);
  const absence = parseQuery(targetResults[3], "promotion_recovery_absence", issues);
  const sourceCatalogs = parsePreseededQuery(sourcePreseeded, "source-preseeded", issues);
  const targetCatalogs = parsePreseededQuery(targetPreseeded, "target-preseeded", issues);

  if (identity) validateIdentity(identity, targetRef, issues);
  if (compatibility && (!Array.isArray(compatibility.blockingIssues) || compatibility.blockingIssues.length > 0)) {
    issues.push(issue("PG17_COMPATIBILITY", JSON.stringify(compatibility.blockingIssues ?? null)));
  }
  if (schema) validateSchema(schema, manifest, localHashes, issues);
  if (absence) validateAbsence(absence, manifest.dataPolicy.include, issues);
  let preseeded = null;
  if (sourceCatalogs && targetCatalogs) {
    try {
      preseeded = comparePreseededReports({
        source: sourceCatalogs,
        target: targetCatalogs,
        expectedTables: manifest.dataPolicy.preseeded,
      });
      issues.push(...preseeded.issues);
    } catch (error) {
      issues.push(issue("PRESEEDED_REPORT_INVALID", error.message));
    }
  }
  const status = issues.length === 0 ? "PASSED" : "BLOCKED";
  const evidenceSha256 = evidence({
    status,
    audit,
    docker,
    psql,
    localHashes,
    identity,
    compatibility,
    schema,
    absence,
    sourceCatalogs,
    targetCatalogs,
    issues,
  });
  return { status, evidenceSha256, issues, reports: { identity, compatibility, schema, absence, sourceCatalogs, targetCatalogs }, health: { docker, psql }, audit, preseeded };
}

async function persist(persistJournal, journal) {
  if (typeof persistJournal !== "function") {
    throw new Error("Recovery schema adoption requires durable journal persistence");
  }
  await persistJournal(journal);
}

export async function adoptRecoverySchema({ manifest, journal, dependencies = {}, ...options }) {
  assertRecoveryManifest(manifest);
  validateJournal(journal, expectedIdentity(manifest));
  if (!["PREFLIGHT_PASSED", "SCHEMA_ADOPTING"].includes(journal.state)) {
    throw new Error(`Recovery schema adoption cannot start from ${journal.state}`);
  }
  const adopting = journal.state === "SCHEMA_ADOPTING"
    ? journal
    : transitionJournal(journal, {
        to: "SCHEMA_ADOPTING",
        evidenceSha256: evidence({
          action: "read-only-schema-adoption",
          manifestSha256: manifest.manifestSha256,
        }),
      });
  if (adopting !== journal) await persist(dependencies.persistJournal, adopting);

  let result;
  try {
    result = await runRecoveryPreflight({ manifest, dependencies, ...options });
  } catch (error) {
    const issues = [issue("RECOVERY_PREFLIGHT_FAILED", error.message)];
    result = { status: "BLOCKED", issues, evidenceSha256: evidence({ status: "BLOCKED", issues }) };
  }
  const next = transitionJournal(adopting, {
    to: result.status === "PASSED" ? "SCHEMA_APPLIED" : "BLOCKED",
    evidenceSha256: result.evidenceSha256,
  });
  await persist(dependencies.persistJournal, next);
  return { ...result, journal: next };
}
