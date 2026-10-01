import { createHash } from "node:crypto";
import path from "node:path";

import { transitionJournal, validateJournal } from "./journal.mjs";
import {
  assertProjectRole,
  assertSafeOperation,
  buildSupabaseInvocation,
} from "./policy.mjs";
import { redactSensitiveText, runProcessOnce } from "./process.mjs";
import { comparePreseededReports, parsePreseededReport } from "./preseeded.mjs";

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

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function evidence(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function issue(code, detail) {
  return { code, detail };
}

function parseReport(stdout) {
  let report;
  try {
    report = JSON.parse(String(stdout ?? "").trim());
  } catch {
    throw new Error("Promotion postflight must return a single JSON document");
  }
  if (Array.isArray(report?.rows) && report.rows.length === 1) {
    const candidates = Object.values(report.rows[0] ?? {}).filter(
      (candidate) => candidate?.kind === "promotion_postflight",
    );
    if (candidates.length !== 1) {
      throw new Error("Postflight query wrapper must contain exactly one report");
    }
    [report] = candidates;
  }
  if (
    !report ||
    Array.isArray(report) ||
    report.contractVersion !== 1 ||
    report.kind !== "promotion_postflight"
  ) {
    throw new Error("Unsupported promotion postflight contract");
  }
  return report;
}

async function defaultQueryProject({ projectRef, repoRoot }) {
  const sqlFile = "infra/territorial/supabase/tests/promotion_postflight.sql";
  const args = ["db", "query", "--linked", "--file", path.resolve(repoRoot, sqlFile)];
  assertSafeOperation({ phase: "verify", projectRef, args });
  const invocation = buildSupabaseInvocation({ args, projectRef });
  return runProcessOnce({ ...invocation, cwd: repoRoot });
}

function compareExact(actual, expected, code, issues) {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    issues.push(issue(code, `expected ${canonicalJson(expected)}, received ${canonicalJson(actual)}`));
  }
}

function validateReport(report, manifest, advisors, expectedDataPolicy) {
  const issues = [];
  compareExact(report.counts, manifest.expectations, "COUNT_MISMATCH", issues);
  compareExact(
    report.sources,
    expectedDataPolicy?.expectedSources,
    "SOURCE_STATE_MISMATCH",
    issues,
  );
  compareExact(
    report.geometries,
    expectedDataPolicy?.expectedGeometries,
    "GEOMETRY_MISMATCH",
    issues,
  );
  compareExact(
    report.correspondences,
    expectedDataPolicy?.expectedCorrespondences,
    "CORRESPONDENCE_MISMATCH",
    issues,
  );
  if (!Array.isArray(report.rpc?.missing) || report.rpc.missing.length > 0) {
    issues.push(issue("RPC_MISSING", canonicalJson(report.rpc?.missing ?? null)));
  }
  for (const [field, code] of [
    ["rlsViolations", "RLS_VIOLATION"],
    ["privilegeViolations", "PRIVILEGE_VIOLATION"],
    ["functionViolations", "FUNCTION_VIOLATION"],
  ]) {
    if (!Array.isArray(report.security?.[field]) || report.security[field].length > 0) {
      issues.push(issue(code, canonicalJson(report.security?.[field] ?? null)));
    }
  }
  if (!Array.isArray(report.operationalObjects) || report.operationalObjects.length > 0) {
    issues.push(issue("OPERATIONAL_OBJECT_PRESENT", canonicalJson(report.operationalObjects ?? null)));
  }
  for (const [field, code] of [
    ["orphanedResultadoStagingReferences", "ORPHANED_STAGING_REFERENCE"],
    ["nonNullResultadoStagingReferences", "NON_NULL_STAGING_REFERENCE"],
  ]) {
    if (!Number.isSafeInteger(report.traceability?.[field]) || report.traceability[field] !== 0) {
      issues.push(issue(code, canonicalJson(report.traceability?.[field] ?? null)));
    }
  }
  if (
    !advisors ||
    advisors.securityCritical !== 0 ||
    advisors.performanceCritical !== 0
  ) {
    issues.push(issue("ADVISOR_FINDING", canonicalJson(advisors ?? null)));
  }
  return issues;
}

function journalIdentity(manifest) {
  return {
    manifestSha256: manifest.manifestSha256,
    sourceCommit: manifest.sourceCommit,
    sourceRef: manifest.source?.projectRef,
    targetRef: manifest.target?.projectRef,
    ...(manifest.contractVersion === 2
      ? {
          mode: manifest.mode,
          predecessorManifestSha256: manifest.recovery?.predecessorManifestSha256,
        }
      : {}),
  };
}

async function persist(dependencies, journal) {
  if (typeof dependencies.persistJournal !== "function") {
    throw new Error("Verification requires durable journal persistence");
  }
  await dependencies.persistJournal(journal);
}

export async function verifyPromotion({
  manifest,
  projectRef,
  journal,
  repoRoot = process.cwd(),
  dependencies = {},
}) {
  assertProjectRole({ projectRef, role: "target", access: "read" });
  if (manifest?.target?.projectRef !== projectRef) {
    throw new Error("Manifest target does not match the verification project");
  }
  validateJournal(journal, journalIdentity(manifest));
  if (journal.state === "VERIFIED") {
    return {
      status: "PASSED",
      journal,
      issues: [],
      evidenceSha256: journal.entries.at(-1).evidenceSha256,
      report: null,
    };
  }
  const blockedVerification =
    journal.state === "BLOCKED" && journal.entries.at(-1)?.from === "VERIFYING";
  if (
    journal.state !== "DATA_APPLIED" &&
    journal.state !== "VERIFYING" &&
    !blockedVerification
  ) {
    throw new Error(`Verification cannot start from ${journal.state}`);
  }

  let current = journal;
  if (journal.state === "DATA_APPLIED") {
    current = transitionJournal(journal, {
      to: "VERIFYING",
      evidenceSha256: evidence({ action: "integral-postflight", projectRef }),
    });
    await persist(dependencies, current);
  }

  const queryProject = dependencies.queryProject ?? defaultQueryProject;
  const queryAdvisors = dependencies.queryAdvisors;
  let queryResult;
  let advisors;
  let preseeded = null;
  const issues = [];
  try {
    if (typeof queryAdvisors !== "function") throw new Error("Native Supabase advisors are required");
    [queryResult, advisors] = await Promise.all([
      queryProject({ projectRef, repoRoot }),
      queryAdvisors({ projectRef }),
    ]);
  } catch (error) {
    issues.push(issue("POSTFLIGHT_FAILED", redactSensitiveText(error?.message ?? String(error))));
  }

  let report = null;
  if (queryResult?.exitCode === 0) {
    try {
      report = parseReport(queryResult.stdout);
    } catch (error) {
      issues.push(issue("POSTFLIGHT_INVALID", error.message));
    }
  } else if (queryResult) {
    issues.push(issue("POSTFLIGHT_FAILED", redactSensitiveText(queryResult.stderr || "query failed")));
  }
  if (report) {
    const effectiveAdvisors = advisors ?? report.advisorReadiness;
    advisors = effectiveAdvisors;
    issues.push(
      ...validateReport(
        report,
        manifest,
        effectiveAdvisors,
        dependencies.expectedDataPolicy ?? manifest.dataPolicy,
      ),
    );
  }
  else if (issues.length === 0) issues.push(issue("POSTFLIGHT_FAILED", "No postflight report"));

  const expectedDataPolicy = dependencies.expectedDataPolicy ?? manifest.dataPolicy;
  const expectedPreseededPolicy = dependencies.expectedPreseededPolicy ?? expectedDataPolicy;
  if (Array.isArray(expectedPreseededPolicy?.preseeded) && expectedPreseededPolicy.preseeded.length > 0) {
    if (typeof dependencies.queryPreseeded !== "function") {
      issues.push(issue("PRESEEDED_PROBE_MISSING", "Source and target preseeded parity is required"));
    } else {
      try {
        const queried = await dependencies.queryPreseeded({
          sourceProjectRef: manifest.source.projectRef,
          targetProjectRef: projectRef,
        });
        if (queried?.source?.exitCode !== 0 || queried?.target?.exitCode !== 0) {
          throw new Error(queried?.source?.stderr || queried?.target?.stderr || "preseeded query failed");
        }
        preseeded = comparePreseededReports({
          source: parsePreseededReport(queried.source.stdout),
          target: parsePreseededReport(queried.target.stdout),
          expectedTables: expectedPreseededPolicy.preseeded,
        });
        issues.push(...preseeded.issues.map((entry) => issue(`PRESEEDED_${entry.code}`, entry.detail)));
      } catch (error) {
        issues.push(issue("PRESEEDED_PROBE_FAILED", redactSensitiveText(error?.message ?? String(error))));
      }
    }
  }

  const evidenceSha256 = evidence({ report, advisors, preseeded, issues });
  const passed = issues.length === 0;
  let finalJournal = current;
  if (passed || current.state !== "BLOCKED") {
    finalJournal = transitionJournal(current, {
      to: passed ? "VERIFIED" : "BLOCKED",
      evidenceSha256,
      probeResolution: current.state === "BLOCKED" ? "verification-reprobe:complete" : null,
    });
    await persist(dependencies, finalJournal);
  }
  return {
    status: passed ? "PASSED" : "BLOCKED",
    journal: finalJournal,
    issues,
    evidenceSha256,
    report,
    preseeded,
  };
}
