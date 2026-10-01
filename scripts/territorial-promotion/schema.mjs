import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { transitionJournal, validateJournal } from "./journal.mjs";
import {
  assertProjectRole,
  assertSafeOperation,
  buildSupabaseInvocation,
} from "./policy.mjs";
import { redactSensitiveText, runProcessOnce } from "./process.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const MIGRATION_NAME = /\b(\d{14}_[a-z0-9_]+\.sql)\b/giu;
const REQUIRED_EXTENSIONS = ["btree_gist", "pgcrypto", "postgis", "vector"];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function evidence(value) {
  return sha256(JSON.stringify(canonicalize(value)));
}

function migrationNames(manifest) {
  if (!Array.isArray(manifest?.migrations) || manifest.migrations.length !== 49) {
    throw new Error("Schema promotion requires exactly 49 manifest migrations");
  }
  const names = manifest.migrations.map(({ path: migrationPath }) =>
    path.posix.basename(String(migrationPath).replaceAll("\\", "/")),
  );
  if (
    names.some((name) => !/^\d{14}_[a-z0-9_]+\.sql$/u.test(name)) ||
    new Set(names).size !== names.length
  ) {
    throw new Error("Manifest migration names are invalid or duplicated");
  }
  return names;
}

function sameOrder(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function redactResult(result) {
  return redactSensitiveText(
    [result?.stdout ?? "", result?.stderr ?? ""].filter(Boolean).join("\n"),
  );
}

export async function planSchemaPromotion({
  manifest,
  projectRef,
  repoRoot = process.cwd(),
  dependencies = {},
}) {
  assertProjectRole({ projectRef, role: "target", access: "read" });
  if (manifest?.target?.projectRef !== projectRef) {
    throw new Error("Manifest target does not match the schema plan target");
  }
  const expected = migrationNames(manifest);
  const args = ["db", "push", "--dry-run", "--skip-vault"];
  assertSafeOperation({ phase: "schema-plan", projectRef, args });
  const invocation = buildSupabaseInvocation({ args, projectRef });
  const runner = dependencies.runProcessOnce ?? runProcessOnce;
  let result;
  try {
    result = await runner({ ...invocation, cwd: repoRoot });
  } catch (error) {
    result = {
      exitCode: null,
      stdout: "",
      stderr: redactSensitiveText(error?.message ?? String(error)),
      errorCode: "RUNNER_ERROR",
    };
  }
  const output = redactResult(result);
  const migrations = [...output.matchAll(MIGRATION_NAME)].map((match) => match[1]);
  const matchesManifest = result.exitCode === 0 && sameOrder(migrations, expected);
  return {
    migrations,
    output,
    evidenceSha256: evidence({ exitCode: result.exitCode, migrations, output }),
    matchesManifest,
  };
}

async function defaultValidateLocalHashes(manifest, repoRoot) {
  const mismatches = [];
  for (const migration of manifest.migrations) {
    const bytes = await readFile(path.resolve(repoRoot, migration.path));
    const actual = sha256(bytes);
    if (!SHA256.test(migration.sha256) || actual !== migration.sha256) {
      mismatches.push(migration.path);
    }
  }
  return { valid: mismatches.length === 0, mismatches };
}

async function defaultQueryProject({ projectRef, sqlFile, repoRoot }) {
  const args = ["db", "query", "--linked", "--file", path.resolve(repoRoot, sqlFile)];
  assertSafeOperation({ phase: "verify", projectRef, args });
  const invocation = buildSupabaseInvocation({ args, projectRef });
  return runProcessOnce({ ...invocation, cwd: repoRoot });
}

function parsePostflight(stdout) {
  let report;
  try {
    report = JSON.parse(String(stdout ?? "").trim());
  } catch {
    throw new Error("Schema postflight must return a single JSON document");
  }
  if (
    !report ||
    Array.isArray(report) ||
    report.contractVersion !== 1 ||
    report.kind !== "promotion_schema_postflight"
  ) {
    throw new Error("Unsupported schema postflight contract");
  }
  return report;
}

export async function probeSchemaState({
  projectRef,
  manifest,
  repoRoot = process.cwd(),
  dependencies = {},
}) {
  assertProjectRole({ projectRef, role: "target", access: "read" });
  if (manifest?.target?.projectRef !== projectRef) {
    throw new Error("Manifest target does not match the schema probe target");
  }
  const expectedNames = migrationNames(manifest);
  const expectedVersions = expectedNames.map((name) => name.slice(0, 14));
  const validateLocalHashes =
    dependencies.validateLocalHashes ??
    ((value) => defaultValidateLocalHashes(value, repoRoot));
  const queryProject = dependencies.queryProject ?? defaultQueryProject;
  let localHashes;
  let result;
  try {
    [localHashes, result] = await Promise.all([
      validateLocalHashes(manifest),
      queryProject({
        projectRef,
        sqlFile: "infra/territorial/supabase/tests/promotion_schema_postflight.sql",
        repoRoot,
      }),
    ]);
  } catch (error) {
    const detail = redactSensitiveText(error?.message ?? String(error));
    return {
      status: "UNKNOWN",
      evidenceSha256: evidence({ status: "UNKNOWN", detail }),
      issues: [{ code: "SCHEMA_PROBE_FAILED", detail }],
      report: null,
    };
  }
  if (result?.exitCode !== 0) {
    const detail = redactSensitiveText(result?.stderr || "Schema probe failed");
    return {
      status: "UNKNOWN",
      evidenceSha256: evidence({ status: "UNKNOWN", detail }),
      issues: [{ code: "SCHEMA_PROBE_FAILED", detail }],
      report: null,
    };
  }

  let report;
  try {
    report = parsePostflight(result.stdout);
  } catch (error) {
    return {
      status: "UNKNOWN",
      evidenceSha256: evidence({ status: "UNKNOWN", detail: error.message }),
      issues: [{ code: "SCHEMA_PROBE_INVALID", detail: error.message }],
      report: null,
    };
  }
  const issues = [];
  if (!localHashes?.valid) {
    issues.push({ code: "LOCAL_HASH_MISMATCH", detail: (localHashes?.mismatches ?? []).join(", ") });
  }
  if (!sameOrder(report.migrationVersions ?? [], expectedVersions)) {
    issues.push({ code: "MIGRATION_HISTORY_MISMATCH", detail: "Expected exact ordered history" });
  }
  const installedExtensions = new Set(report.extensions ?? []);
  for (const extension of REQUIRED_EXTENSIONS) {
    if (!installedExtensions.has(extension)) {
      issues.push({ code: "EXTENSION_MISSING", detail: extension });
    }
  }
  for (const [field, code] of [
    ["missingRequiredObjects", "REQUIRED_OBJECT_MISSING"],
    ["rlsViolations", "RLS_VIOLATION"],
    ["privilegeViolations", "PRIVILEGE_VIOLATION"],
    ["functionViolations", "FUNCTION_VIOLATION"],
    ["operationalObjects", "OPERATIONAL_OBJECT_PRESENT"],
  ]) {
    if (!Array.isArray(report[field]) || report[field].length > 0) {
      issues.push({ code, detail: JSON.stringify(report[field] ?? null) });
    }
  }
  if (!Number.isSafeInteger(report.territorialObjectCount) || report.territorialObjectCount <= 0) {
    issues.push({ code: "TERRITORIAL_OBJECTS_MISSING", detail: String(report.territorialObjectCount) });
  }

  const emptyHistory = Array.isArray(report.migrationVersions) && report.migrationVersions.length === 0;
  const status =
    issues.length === 0
      ? "COMPLETE"
      : emptyHistory && report.territorialObjectCount === 0
        ? "ABSENT"
        : "PARTIAL";
  return {
    status,
    evidenceSha256: evidence({ status, localHashes, report, issues }),
    issues,
    report,
  };
}

function expectedJournalIdentity(manifest) {
  return {
    manifestSha256: manifest.manifestSha256,
    sourceCommit: manifest.sourceCommit,
    sourceRef: manifest.source?.projectRef,
    targetRef: manifest.target?.projectRef,
  };
}

function processEvidence(result) {
  return evidence({
    exitCode: result?.exitCode ?? null,
    errorCode: result?.errorCode ?? null,
    output: redactResult(result),
  });
}

async function persistTransition(persistJournal, journal) {
  if (typeof persistJournal !== "function") {
    throw new Error("Schema promotion requires durable journal persistence");
  }
  await persistJournal(journal);
  return journal;
}

async function resumeSchemaPromotion({ manifest, journal, dependencies }) {
  const probe = await (dependencies.probeSchemaState ?? probeSchemaState)({
    projectRef: manifest.target.projectRef,
    manifest,
    dependencies,
  });
  let next = journal;
  const withResolution = journal.state === "FAILED_UNKNOWN" || journal.state === "BLOCKED";
  const resolution = withResolution ? `schema-probe:${probe.status.toLowerCase()}` : null;
  if (probe.status === "COMPLETE") {
    next = transitionJournal(journal, {
      to: "SCHEMA_APPLIED",
      evidenceSha256: probe.evidenceSha256,
      probeResolution: resolution,
    });
  } else if (probe.status === "ABSENT") {
    if (journal.state === "SCHEMA_APPLYING" || journal.state === "FAILED_UNKNOWN") {
      next = transitionJournal(journal, {
        to: "FAILED_CONFIRMED",
        evidenceSha256: probe.evidenceSha256,
        probeResolution: resolution,
      });
    }
  } else if (journal.state === "SCHEMA_APPLYING") {
    next = transitionJournal(journal, {
      to: "FAILED_UNKNOWN",
      evidenceSha256: probe.evidenceSha256,
    });
  }
  if (next !== journal) await persistTransition(dependencies.persistJournal, next);
  return next;
}

export async function applySchemaPromotionOnce({
  manifest,
  journal,
  confirmation,
  repoRoot = process.cwd(),
  dependencies = {},
}) {
  validateJournal(journal, expectedJournalIdentity(manifest));
  assertProjectRole({
    projectRef: manifest.target?.projectRef,
    role: "target",
    access: "write",
  });
  if (confirmation !== `${manifest.manifestSha256}:SCHEMA_APPLY`) {
    throw new Error("Schema promotion confirmation does not match the manifest");
  }
  if (journal.state === "SCHEMA_APPLIED") return journal;
  if (["SCHEMA_APPLYING", "FAILED_UNKNOWN", "BLOCKED"].includes(journal.state)) {
    return resumeSchemaPromotion({ manifest, journal, dependencies });
  }
  if (journal.state !== "PREFLIGHT_PASSED") {
    throw new Error(`Schema promotion cannot start from ${journal.state}`);
  }

  const planner = dependencies.planSchemaPromotion ?? planSchemaPromotion;
  const plan = await planner({
    manifest,
    projectRef: manifest.target.projectRef,
    repoRoot,
    dependencies,
  });
  const expectedMigrations = migrationNames(manifest);
  if (
    !plan?.matchesManifest ||
    !Array.isArray(plan.migrations) ||
    !sameOrder(plan.migrations, expectedMigrations) ||
    !SHA256.test(plan.evidenceSha256)
  ) {
    throw new Error("Schema plan does not exactly match the manifest");
  }

  const applying = transitionJournal(journal, {
    to: "SCHEMA_APPLYING",
    evidenceSha256: plan.evidenceSha256,
  });
  await persistTransition(dependencies.persistJournal, applying);

  const args = ["db", "push", "--skip-vault"];
  assertSafeOperation({
    phase: "schema-apply",
    projectRef: manifest.target.projectRef,
    args,
  });
  const invocation = buildSupabaseInvocation({
    args,
    projectRef: manifest.target.projectRef,
  });
  const runner = dependencies.runProcessOnce ?? runProcessOnce;
  let processResult;
  try {
    processResult = await runner({ ...invocation, cwd: repoRoot });
  } catch (error) {
    processResult = {
      exitCode: null,
      stdout: "",
      stderr: redactSensitiveText(error?.message ?? String(error)),
      errorCode: "RUNNER_ERROR",
    };
  }

  if (processResult.exitCode !== 0) {
    const failed = transitionJournal(applying, {
      to: Number.isInteger(processResult.exitCode) ? "FAILED_CONFIRMED" : "FAILED_UNKNOWN",
      evidenceSha256: processEvidence(processResult),
    });
    return persistTransition(dependencies.persistJournal, failed);
  }

  let probe;
  try {
    probe = await (dependencies.probeSchemaState ?? probeSchemaState)({
      projectRef: manifest.target.projectRef,
      manifest,
      repoRoot,
      dependencies,
    });
  } catch (error) {
    const detail = redactSensitiveText(error?.message ?? String(error));
    probe = {
      status: "UNKNOWN",
      evidenceSha256: evidence({ status: "UNKNOWN", detail }),
    };
  }
  const next = transitionJournal(applying, {
    to: probe.status === "COMPLETE" ? "SCHEMA_APPLIED" : "FAILED_UNKNOWN",
    evidenceSha256: probe.evidenceSha256,
  });
  return persistTransition(dependencies.persistJournal, next);
}
