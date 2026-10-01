import path from "node:path";

import { auditMigrations } from "./migration-audit.mjs";
import {
  assertProjectRole,
  assertSafeOperation,
  buildSupabaseInvocation,
} from "./policy.mjs";
import { redactSensitiveText, runProcessOnce } from "./process.mjs";

const EXPECTATION_TABLES = {
  cartographyVersions: "cartografia_versiones",
  sections: "territorios_secciones",
  municipalities: "territorios_municipios",
  localDistricts: "territorios_distritos_locales",
  federalDistricts: "territorios_distritos_federales",
  ecegSections: "demografia_eceg_secciones",
  nominalRows: "lista_nominal_secciones",
};

function issue(code, detail, scope = "schema") {
  return { code, detail, scope };
}

export function parsePreflightReport(stdout, expectedKind) {
  const text = String(stdout ?? "").trim();
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Preflight probe must return a single JSON document");
  }
  if (Array.isArray(value?.rows) && value.rows.length === 1) {
    const candidates = Object.values(value.rows[0] ?? {}).filter(
      (candidate) => candidate?.kind === expectedKind,
    );
    if (candidates.length !== 1) {
      throw new Error("Preflight query wrapper must contain exactly one report");
    }
    [value] = candidates;
  }
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error("Preflight probe must return one JSON object");
  }
  if (value.contractVersion !== 1 || value.kind !== expectedKind) {
    throw new Error(`Unsupported preflight contract for ${expectedKind}`);
  }
  return value;
}

async function defaultDockerHealth() {
  const result = await runProcessOnce({
    command: "docker",
    args: ["info", "--format", "{{json .ServerVersion}}"],
  });
  return {
    available: result.exitCode === 0,
    detail: result.exitCode === 0 ? result.stdout.trim() : result.stderr.trim(),
  };
}

async function defaultPsqlHealth() {
  const result = await runProcessOnce({ command: "psql", args: ["--version"] });
  return {
    available: result.exitCode === 0,
    detail: result.exitCode === 0 ? result.stdout.trim() : result.stderr.trim(),
  };
}

async function defaultQueryProject({ projectRef, sqlFile, repoRoot }) {
  const args = ["db", "query", "--linked", "--file", path.resolve(repoRoot, sqlFile)];
  assertSafeOperation({ phase: "preflight", projectRef, args });
  const invocation = buildSupabaseInvocation({ args, projectRef });
  return runProcessOnce({ ...invocation, cwd: repoRoot });
}

function validateProbeIdentity(report, projectRef, issues) {
  if (report.projectRef && report.projectRef !== projectRef) {
    issues.push(issue("PROJECT_IDENTITY_MISMATCH", `Probe reported ${report.projectRef}`));
  }
  if (
    !report.identity ||
    typeof report.identity.database !== "string" ||
    !Number.isSafeInteger(report.identity.postgresVersionNumber)
  ) {
    issues.push(issue("DATABASE_IDENTITY_INVALID", "Database identity is incomplete"));
  }
}

function validateTarget(report, issues) {
  if (!Array.isArray(report.userTables) || report.userTables.length > 0) {
    issues.push(issue("TARGET_NOT_EMPTY", "Target contains public user tables"));
  }
  if (
    report.migrationHistory?.exists === true ||
    report.migrationHistory?.rows !== 0
  ) {
    issues.push(issue("TARGET_NOT_EMPTY", "Target migration history is not empty"));
  }
}

function validateSource(report, expectations, issues) {
  const tables = new Set(Array.isArray(report.userTables) ? report.userTables : []);
  for (const table of Object.values(EXPECTATION_TABLES)) {
    if (!tables.has(table)) {
      issues.push(issue("SOURCE_OBJECT_MISSING", `Source table is missing: public.${table}`));
    }
  }
  for (const [key, expected] of Object.entries(expectations ?? {})) {
    if (!(key in EXPECTATION_TABLES)) continue;
    const actual = report.counts?.[key];
    if (actual !== expected) {
      issues.push(
        issue(
          "SOURCE_COUNT_MISMATCH",
          `${key}: expected ${expected}, received ${String(actual)}`,
        ),
      );
    }
  }
}

function parseProbeResult(result, kind, issues) {
  if (!result || result.exitCode !== 0) {
    issues.push(issue("PROBE_FAILED", `${kind}: ${result?.stderr || "no result"}`));
    return null;
  }
  try {
    return parsePreflightReport(result.stdout, kind);
  } catch (error) {
    issues.push(issue("PROBE_INVALID", error.message));
    return null;
  }
}

async function captureDependency(operation, fallback) {
  try {
    return await operation();
  } catch (error) {
    return fallback(redactSensitiveText(error?.message ?? String(error)));
  }
}

export async function runReadOnlyPreflight({
  role,
  projectRef,
  manifest,
  migrationDir,
  exceptions,
  repoRoot = process.cwd(),
  dependencies = {},
}) {
  assertProjectRole({ projectRef, role, access: "read" });
  if (manifest?.[role]?.projectRef !== projectRef) {
    throw new Error(`Manifest ${role} reference does not match the requested project`);
  }

  const deps = {
    auditMigrations,
    dockerHealth: defaultDockerHealth,
    psqlHealth: defaultPsqlHealth,
    queryProject: defaultQueryProject,
    ...dependencies,
  };
  const preflightFile = "infra/territorial/supabase/tests/promotion_preflight.sql";
  const compatibilityFile =
    "infra/territorial/supabase/tests/promotion_pg17_compatibility.sql";

  const [auditResult, docker, psql, rawPreflight, rawCompatibility] =
    await Promise.all([
      captureDependency(
        () => deps.auditMigrations({ migrationDir, exceptions }),
        (message) => ({ passed: false, errors: [{ message }], warnings: [] }),
      ),
      captureDependency(
        () => deps.dockerHealth(),
        (detail) => ({ available: false, detail }),
      ),
      captureDependency(
        () => deps.psqlHealth(),
        (detail) => ({ available: false, detail }),
      ),
      captureDependency(
        () => deps.queryProject({ projectRef, sqlFile: preflightFile, repoRoot }),
        (stderr) => ({ exitCode: null, stdout: "", stderr }),
      ),
      captureDependency(
        () => deps.queryProject({ projectRef, sqlFile: compatibilityFile, repoRoot }),
        (stderr) => ({ exitCode: null, stdout: "", stderr }),
      ),
    ]);

  const issues = [];
  if (!auditResult?.passed) {
    issues.push(issue("MIGRATION_AUDIT_FAILED", `${auditResult?.errors?.length ?? 0} error(s)`));
  }
  if (!psql?.available) {
    issues.push(issue("PSQL_UNAVAILABLE", psql?.detail || "psql unavailable"));
  }
  if (!docker?.available) {
    issues.push(issue("DOCKER_UNAVAILABLE", docker?.detail || "Docker unavailable", "data"));
  }

  const report = parseProbeResult(rawPreflight, "promotion_preflight", issues);
  const compatibility = parseProbeResult(
    rawCompatibility,
    "promotion_pg17_compatibility",
    issues,
  );
  if (report) {
    validateProbeIdentity(report, projectRef, issues);
    if (role === "target") validateTarget(report, issues);
    else validateSource(report, manifest.expectations, issues);
  }
  if (compatibility && compatibility.blockingIssues?.length > 0) {
    issues.push(
      issue(
        "PG17_COMPATIBILITY",
        compatibility.blockingIssues.join(", "),
      ),
    );
  }

  const schemaIssues = issues.filter(({ scope }) => scope !== "data");
  const schemaStatus = schemaIssues.length === 0 ? "PASSED" : "BLOCKED";
  const dataStatus =
    schemaStatus === "PASSED" && issues.length === 0 ? "PASSED" : "BLOCKED";
  return {
    status: schemaStatus === "PASSED" && dataStatus === "PASSED" ? "PASSED" : "BLOCKED",
    schemaSimulation: { status: schemaStatus },
    dataTransfer: { status: dataStatus },
    issues,
    audit: auditResult,
    report,
    compatibility,
    health: { docker, psql },
  };
}
