import { createHash } from "node:crypto";
import { readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { buildDumpPlan, createDataArtifact, restoreDataArtifactOnce } from "./database-transfer.mjs";
import { createJournal, createRecoveryJournal, loadJournal, saveJournalAtomically, transitionJournal } from "./journal.mjs";
import { loadPromotionManifest } from "./manifest.mjs";
import {
  SOURCE_PROJECT_REF,
  TARGET_PROJECT_REF,
  assertProjectRole,
  assertSafeOperation,
  buildSupabaseInvocation,
} from "./policy.mjs";
import { runReadOnlyPreflight } from "./preflight.mjs";
import { adoptRecoverySchema, runRecoveryPreflight } from "./recovery.mjs";
import { redactSensitiveText, runProcessOnce } from "./process.mjs";
import { applySchemaPromotionOnce, planSchemaPromotion } from "./schema.mjs";
import { verifyPromotion } from "./verification.mjs";

const COMMANDS = new Set([
  "preflight",
  "recovery-preflight",
  "schema-plan",
  "schema-apply",
  "schema-adopt",
  "data-plan",
  "data-apply",
  "verify",
  "status",
]);
const WRITE_COMMANDS = new Set(["schema-apply", "data-apply"]);
const LEGACY_COMMANDS = new Set(["preflight", "schema-plan", "schema-apply", "data-plan", "data-apply", "verify", "status"]);
const RECOVERY_COMMANDS = new Set(["recovery-preflight", "schema-adopt", "data-plan", "data-apply", "verify", "status"]);
const OPTIONS = new Map([
  ["--manifest", "manifestPath"],
  ["--confirm", "confirmation"],
]);
const SENSITIVE_KEY = /password|token|api.?key|service.?role|secret/iu;

export function parsePromotionArgs(argv) {
  if (!Array.isArray(argv) || argv.length === 0) {
    throw new Error("A promotion command is required");
  }
  const [command, ...rest] = argv;
  if (!COMMANDS.has(command)) throw new Error(`Unknown promotion command: ${command}`);
  const parsed = { command, manifestPath: null, confirmation: null };
  const seen = new Set();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const key = OPTIONS.get(flag);
    if (!key) {
      if (flag?.startsWith("--")) throw new Error(`Unknown promotion flag: ${flag}`);
      throw new Error(`Unexpected promotion argument: ${String(flag)}`);
    }
    const value = rest[index + 1];
    if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
      throw new Error(`Missing value for ${flag}`);
    }
    if (seen.has(flag)) throw new Error(`Duplicate promotion flag: ${flag}`);
    seen.add(flag);
    parsed[key] = value;
  }
  if (!parsed.manifestPath) throw new Error("Every promotion command requires --manifest");
  if (parsed.confirmation && !WRITE_COMMANDS.has(command)) {
    throw new Error("Confirmation is accepted only for write commands");
  }
  if (WRITE_COMMANDS.has(command) && !parsed.confirmation) {
    throw new Error(`${command} requires --confirm`);
  }
  return parsed;
}

function sanitize(value, key = "") {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([entryKey]) => entryKey !== "retry")
        .map(([entryKey, item]) => [entryKey, sanitize(item, entryKey)]),
    );
  }
  if (typeof value === "string") return redactSensitiveText(value);
  return value;
}

function exitCodeFor(summary) {
  const status = summary?.status ?? summary?.state;
  if (status === "FAILED_CONFIRMED") return 1;
  if (status === "BLOCKED" || status === "FAILED_UNKNOWN") return 2;
  return 0;
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function resolveFrozenDataPolicy(manifest, loadPredecessor) {
  if (manifest?.contractVersion === 2) {
    const loaded = await loadPredecessor(manifest.recovery?.predecessorManifestSha256);
    if (!loaded?.predecessorManifest?.dataPolicy) {
      throw new Error("Recovery predecessor data policy is unavailable");
    }
    return loaded.predecessorManifest.dataPolicy;
  }
  if (!manifest?.dataPolicy) throw new Error("Manifest data policy is unavailable");
  return manifest.dataPolicy;
}

export function classifyDataRestoreProbe({ report, expectations }) {
  if (report?.contractVersion !== 1 || report?.kind !== "promotion_postflight") {
    throw new Error("Data-state probe returned an invalid postflight report");
  }
  const actualKeys = Object.keys(report.counts ?? {}).sort();
  const expectedKeys = Object.keys(expectations ?? {}).sort();
  const exact = JSON.stringify(actualKeys) === JSON.stringify(expectedKeys) &&
    expectedKeys.every((key) => report.counts[key] === expectations[key]);
  const status = exact
    ? "COMPLETE"
    : "PARTIAL";
  return { status, evidenceSha256: sha256({ report, expectations, status }) };
}

async function runGit(repoRoot, args) {
  const result = await runProcessOnce({ command: "git", args, cwd: repoRoot });
  if (result.exitCode !== 0) throw new Error(`Git check failed: ${result.stderr}`);
  return result.stdout.trim();
}

function unwrapQueryReport(stdout, expectedKind) {
  let value;
  try {
    value = JSON.parse(String(stdout ?? "").trim());
  } catch {
    throw new Error("Supabase query did not return JSON");
  }
  if (value?.kind === expectedKind) return value;
  if (Array.isArray(value?.rows) && value.rows.length === 1) {
    const candidates = Object.values(value.rows[0] ?? {}).filter(
      (candidate) => candidate?.kind === expectedKind,
    );
    if (candidates.length === 1) return candidates[0];
  }
  throw new Error(`Supabase query did not return one ${expectedKind} report`);
}

async function writeJsonAtomically(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

export function runtimePaths(repoRoot, manifest) {
  const root = path.join(repoRoot, "infra", "territorial");
  return {
    journal: path.join(root, "journals", `${manifest.manifestSha256}.json`),
    artifact: path.join(root, "artifacts", manifest.manifestSha256, "territorial-data.sql"),
    artifactMetadata: path.join(root, "artifacts", manifest.manifestSha256, "artifact.json"),
    failureEvidence: path.join(root, "artifacts", manifest.manifestSha256, "failure.json"),
  };
}

async function queryInventory(repoRoot) {
  const sqlFile = path.join(
    repoRoot,
    "infra",
    "territorial",
    "supabase",
    "tests",
    "promotion_data_inventory.sql",
  );
  const args = ["db", "query", "--linked", "--file", sqlFile];
  assertSafeOperation({ phase: "preflight", projectRef: SOURCE_PROJECT_REF, args });
  const invocation = buildSupabaseInvocation({ args, projectRef: SOURCE_PROJECT_REF });
  const result = await runProcessOnce({ ...invocation, cwd: repoRoot });
  if (result.exitCode !== 0) {
    throw new Error(`Data inventory BLOCKED: ${result.stderr}`);
  }
  return unwrapQueryReport(result.stdout, "promotion_data_inventory");
}

async function loadExistingJournal(journalPath, manifest) {
  try {
    return await loadJournal(journalPath, {
      manifestSha256: manifest.manifestSha256,
      sourceCommit: manifest.sourceCommit,
      sourceRef: manifest.source.projectRef,
      targetRef: manifest.target.projectRef,
      ...(manifest.contractVersion === 2
        ? {
            mode: manifest.mode,
            predecessorManifestSha256: manifest.recovery?.predecessorManifestSha256,
          }
        : {}),
    });
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function nextAction(state, manifest) {
  return {
    CREATED: manifest?.contractVersion === 2 ? "recovery-preflight" : "preflight",
    PREFLIGHT_PASSED: manifest?.contractVersion === 2 ? "schema-adopt" : "schema-plan",
    SCHEMA_APPLIED: "data-plan",
    DATA_APPLIED: "verify",
    VERIFIED: "preview-cutover",
    BLOCKED: "status",
    FAILED_UNKNOWN: "status",
    FAILED_CONFIRMED: "manual-review",
  }[state] ?? "status";
}

function createDefaultDependencies(repoRoot = process.cwd()) {
  const loadPredecessor = async (expectedHash) => {
    const directory = path.join(repoRoot, "infra", "territorial", "manifests", "production");
    const candidates = [];
    for (const name of (await readdir(directory)).filter((value) => value.endsWith(".json")).sort()) {
      const candidate = JSON.parse(await readFile(path.join(directory, name), "utf8"));
      if (candidate?.manifestSha256 === expectedHash) candidates.push(candidate);
    }
    if (candidates.length !== 1) {
      throw new Error("Recovery predecessor manifest is missing or ambiguous");
    }
    const predecessorJournal = JSON.parse(
      await readFile(path.join(repoRoot, "infra", "territorial", "journals", `${expectedHash}.json`), "utf8"),
    );
    return { predecessorManifest: candidates[0], predecessorJournal };
  };
  const loadManifest = async (manifestPath) => {
    const currentCommit = await runGit(repoRoot, ["rev-parse", "HEAD"]);
    return loadPromotionManifest(path.resolve(repoRoot, manifestPath), {
      repoRoot,
      currentCommit,
      isAncestor: async (ancestor, current) => {
        const result = await runProcessOnce({
          command: "git",
          args: ["merge-base", "--is-ancestor", ancestor, current],
          cwd: repoRoot,
        });
        return result.exitCode === 0;
      },
      loadPredecessor,
    });
  };
  const queryProjectSql = async ({ projectRef, sqlFile, phase = "verify" }) => {
    const args = ["db", "query", "--linked", "--file", path.resolve(repoRoot, sqlFile)];
    assertSafeOperation({ phase, projectRef, args });
    const invocation = buildSupabaseInvocation({ args, projectRef });
    return runProcessOnce({ ...invocation, cwd: repoRoot });
  };
  const queryNativeAdvisors = async ({ projectRef }) => {
    const args = [
      "db", "advisors", "--linked", "--project-ref", projectRef,
      "--type", "all", "--level", "error", "--fail-on", "error", "-o", "json",
    ];
    const result = await runProcessOnce({ command: "npm.cmd", args: ["exec", "supabase", "--", ...args], cwd: repoRoot });
    if (result.exitCode !== 0) {
      throw new Error(`Native Supabase advisors BLOCKED: ${result.stderr || result.stdout}`);
    }
    return { securityCritical: 0, performanceCritical: 0 };
  };

  const commands = {
    "recovery-preflight": async ({ manifest }) => {
      const paths = runtimePaths(repoRoot, manifest);
      const exceptionConfig = JSON.parse(
        await readFile(path.join(repoRoot, "infra", "territorial", "security-exceptions.json"), "utf8"),
      );
      let journal = await loadExistingJournal(paths.journal, manifest);
      if (!journal) {
        journal = createRecoveryJournal({
          manifestSha256: manifest.manifestSha256,
          sourceCommit: manifest.sourceCommit,
          sourceRef: manifest.source.projectRef,
          targetRef: manifest.target.projectRef,
          predecessorManifestSha256: manifest.recovery.predecessorManifestSha256,
        });
      }
      if (journal.state === "PREFLIGHT_PASSED") {
        return { status: "PASSED", state: journal.state, nextAction: nextAction(journal.state, manifest) };
      }
      if (!["CREATED", "BLOCKED"].includes(journal.state)) {
        return { status: "BLOCKED", state: journal.state, nextAction: nextAction(journal.state, manifest) };
      }
      const result = await runRecoveryPreflight({
        manifest,
        migrationDir: path.join(repoRoot, "infra", "territorial", "supabase", "migrations"),
        exceptions: exceptionConfig.exceptions,
        repoRoot,
      });
      if (journal.state === "CREATED" || result.status === "PASSED") {
        journal = transitionJournal(journal, {
          to: result.status === "PASSED" ? "PREFLIGHT_PASSED" : "BLOCKED",
          evidenceSha256: result.evidenceSha256,
          probeResolution: journal.state === "BLOCKED" ? "recovery-preflight-reprobe" : null,
        });
        await saveJournalAtomically(paths.journal, journal);
      }
      return {
        status: result.status,
        state: journal.state,
        issues: result.issues,
        evidenceSha256: result.evidenceSha256,
        nextAction: nextAction(journal.state, manifest),
      };
    },
    preflight: async ({ manifest }) => {
      const paths = runtimePaths(repoRoot, manifest);
      const exceptionConfig = JSON.parse(
        await readFile(path.join(repoRoot, "infra", "territorial", "security-exceptions.json"), "utf8"),
      );
      const common = {
        manifest,
        migrationDir: path.join(repoRoot, "infra", "territorial", "supabase", "migrations"),
        exceptions: exceptionConfig.exceptions,
        repoRoot,
      };
      const [source, target] = await Promise.all([
        runReadOnlyPreflight({ ...common, role: "source", projectRef: SOURCE_PROJECT_REF }),
        runReadOnlyPreflight({ ...common, role: "target", projectRef: TARGET_PROJECT_REF }),
      ]);
      let journal = await loadExistingJournal(paths.journal, manifest);
      if (!journal) {
        journal = createJournal({
          manifestSha256: manifest.manifestSha256,
          sourceCommit: manifest.sourceCommit,
          sourceRef: manifest.source.projectRef,
          targetRef: manifest.target.projectRef,
        });
      }
      const schemaPassed =
        source.schemaSimulation.status === "PASSED" &&
        target.schemaSimulation.status === "PASSED";
      if (journal.state === "CREATED" || (journal.state === "BLOCKED" && schemaPassed)) {
        journal = transitionJournal(journal, {
          to: schemaPassed ? "PREFLIGHT_PASSED" : "BLOCKED",
          evidenceSha256: sha256({ source, target }),
          probeResolution: journal.state === "BLOCKED" ? "preflight-reprobe" : null,
        });
        await saveJournalAtomically(paths.journal, journal);
      }
      return {
        status: schemaPassed ? "PASSED" : "BLOCKED",
        state: journal.state,
        source: source.status,
        target: target.status,
        dataTransfer: source.dataTransfer.status === "PASSED" && target.dataTransfer.status === "PASSED" ? "PASSED" : "BLOCKED",
        nextAction: nextAction(journal.state, manifest),
      };
    },
    "schema-plan": async ({ manifest }) => {
      const plan = await planSchemaPromotion({
        manifest,
        projectRef: TARGET_PROJECT_REF,
        repoRoot,
      });
      return {
        status: plan.matchesManifest ? "PASSED" : "BLOCKED",
        migrations: plan.migrations.length,
        evidenceSha256: plan.evidenceSha256,
        confirmation: `${manifest.manifestSha256}:SCHEMA_APPLY`,
      };
    },
    "schema-apply": async ({ manifest, confirmation }) => {
      const paths = runtimePaths(repoRoot, manifest);
      const journal = await loadExistingJournal(paths.journal, manifest);
      if (!journal) return { status: "BLOCKED", reason: "journal missing" };
      const next = await applySchemaPromotionOnce({
        manifest,
        journal,
        confirmation,
        repoRoot,
        dependencies: {
          persistJournal: (value) => saveJournalAtomically(paths.journal, value),
        },
      });
      return { status: next.state, state: next.state, nextAction: nextAction(next.state, manifest) };
    },
    "schema-adopt": async ({ manifest }) => {
      const paths = runtimePaths(repoRoot, manifest);
      const journal = await loadExistingJournal(paths.journal, manifest);
      if (!journal) return { status: "BLOCKED", reason: "journal missing" };
      const exceptionConfig = JSON.parse(
        await readFile(path.join(repoRoot, "infra", "territorial", "security-exceptions.json"), "utf8"),
      );
      const result = await adoptRecoverySchema({
        manifest,
        journal,
        migrationDir: path.join(repoRoot, "infra", "territorial", "supabase", "migrations"),
        exceptions: exceptionConfig.exceptions,
        repoRoot,
        dependencies: {
          persistJournal: (value) => saveJournalAtomically(paths.journal, value),
        },
      });
      return {
        status: result.status,
        state: result.journal.state,
        issues: result.issues,
        evidenceSha256: result.evidenceSha256,
        nextAction: nextAction(result.journal.state, manifest),
      };
    },
    "data-plan": async ({ manifest }) => {
      const paths = runtimePaths(repoRoot, manifest);
      const journal = await loadExistingJournal(paths.journal, manifest);
      if (!journal || journal.state !== "SCHEMA_APPLIED") {
        return { status: "BLOCKED", reason: "schema is not applied" };
      }
      const [inventory, dataPolicy] = await Promise.all([
        queryInventory(repoRoot),
        resolveFrozenDataPolicy(manifest, loadPredecessor),
      ]);
      const plan = buildDumpPlan({ inventory, dataPolicy, artifactPath: paths.artifact });
      const artifact = await createDataArtifact({ plan, manifest, repoRoot });
      await writeJsonAtomically(paths.artifactMetadata, artifact);
      return {
        status: "PASSED",
        artifact: { path: artifact.path, sha256: artifact.sha256, sizeBytes: artifact.sizeBytes },
        confirmation: `${manifest.manifestSha256}:DATA_APPLY`,
      };
    },
    "data-apply": async ({ manifest, confirmation }) => {
      const paths = runtimePaths(repoRoot, manifest);
      const [journal, artifact] = await Promise.all([
        loadExistingJournal(paths.journal, manifest),
        readFile(paths.artifactMetadata, "utf8").then(JSON.parse),
      ]);
      if (!journal) return { status: "BLOCKED", reason: "journal missing" };
      const next = await restoreDataArtifactOnce({
        artifact,
        manifest,
        journal,
        confirmation,
        dependencies: {
          persistJournal: (value) => saveJournalAtomically(paths.journal, value),
          getTargetConnection: async () => ({
            projectRef: TARGET_PROJECT_REF,
            env: {
              PGHOST: process.env.TERRITORIAL_PGHOST,
              PGPORT: process.env.TERRITORIAL_PGPORT ?? "5432",
              PGUSER: process.env.TERRITORIAL_PGUSER ?? "postgres",
              PGDATABASE: process.env.TERRITORIAL_PGDATABASE ?? "postgres",
              PGPASSWORD: process.env.TERRITORIAL_PGPASSWORD,
              PGSSLMODE: process.env.TERRITORIAL_PGSSLMODE ?? "require",
            },
          }),
          probeDataState: async ({ projectRef, manifest: activeManifest }) => {
            const result = await queryProjectSql({
              projectRef,
              sqlFile: "infra/territorial/supabase/tests/promotion_postflight.sql",
            });
            if (result.exitCode !== 0) throw new Error(`Data-state probe BLOCKED: ${result.stderr}`);
            return classifyDataRestoreProbe({
              report: unwrapQueryReport(result.stdout, "promotion_postflight"),
              expectations: activeManifest.expectations,
            });
          },
        },
      });
      let failure = null;
      if (["FAILED_CONFIRMED", "FAILED_UNKNOWN"].includes(next.state)) {
        try {
          failure = JSON.parse(await readFile(paths.failureEvidence, "utf8"));
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      }
      return {
        status: next.state,
        state: next.state,
        failure,
        nextAction: nextAction(next.state, manifest),
      };
    },
    verify: async ({ manifest }) => {
      const paths = runtimePaths(repoRoot, manifest);
      const journal = await loadExistingJournal(paths.journal, manifest);
      if (!journal) return { status: "BLOCKED", reason: "journal missing" };
      const expectedDataPolicy = manifest.contractVersion === 2
        ? (await loadPredecessor(manifest.recovery.predecessorManifestSha256)).predecessorManifest.dataPolicy
        : manifest.dataPolicy;
      const result = await verifyPromotion({
        manifest,
        projectRef: TARGET_PROJECT_REF,
        journal,
        repoRoot,
        dependencies: {
          expectedDataPolicy,
          queryProject: ({ projectRef }) => queryProjectSql({
            projectRef,
            sqlFile: "infra/territorial/supabase/tests/promotion_postflight.sql",
          }),
          queryAdvisors: queryNativeAdvisors,
          queryPreseeded: async ({ sourceProjectRef, targetProjectRef }) => {
            const sqlFile = "infra/territorial/supabase/tests/promotion_preseeded_catalogs.sql";
            const [source, target] = await Promise.all([
              queryProjectSql({ projectRef: sourceProjectRef, sqlFile }),
              queryProjectSql({ projectRef: targetProjectRef, sqlFile }),
            ]);
            return { source, target };
          },
          persistJournal: (value) => saveJournalAtomically(paths.journal, value),
        },
      });
      return {
        status: result.status,
        state: result.journal.state,
        evidenceSha256: result.evidenceSha256,
        issues: result.issues,
        nextAction: nextAction(result.journal.state, manifest),
      };
    },
    status: async ({ manifest }) => {
      const paths = runtimePaths(repoRoot, manifest);
      const journal = await loadExistingJournal(paths.journal, manifest);
      if (!journal) {
        return {
          status: "BLOCKED",
          reason: "journal missing",
          nextAction: nextAction("CREATED", manifest),
        };
      }
      return {
        status: journal.state,
        state: journal.state,
        manifestSha256: journal.manifestSha256,
        updatedAt: journal.updatedAt,
        nextAction: nextAction(journal.state, manifest),
      };
    },
  };
  return { loadManifest, commands };
}

export async function runPromotionCommand({ argv, dependencies = {} }) {
  const parsed = parsePromotionArgs(argv);
  const defaults =
    typeof dependencies.loadManifest === "function" && dependencies.commands
      ? null
      : createDefaultDependencies();
  const active = {
    ...defaults,
    ...dependencies,
    commands: dependencies.commands ?? defaults?.commands,
  };
  if (typeof active.loadManifest !== "function") throw new Error("Promotion manifest loader is unavailable");
  const manifest = await active.loadManifest(parsed.manifestPath);
  const allowed = manifest?.contractVersion === 2 ? RECOVERY_COMMANDS : LEGACY_COMMANDS;
  if (!allowed.has(parsed.command)) {
    throw new Error(
      `Command ${parsed.command} is not allowed for manifest contract ${String(manifest?.contractVersion)}`,
    );
  }
  assertProjectRole({
    projectRef: manifest?.source?.projectRef,
    role: "source",
    access: "read",
  });
  assertProjectRole({
    projectRef: manifest?.target?.projectRef,
    role: "target",
    access: WRITE_COMMANDS.has(parsed.command) ? "write" : "read",
  });
  if (parsed.command === "schema-apply" && parsed.confirmation !== `${manifest.manifestSha256}:SCHEMA_APPLY`) {
    throw new Error("Schema confirmation does not match the manifest");
  }
  if (parsed.command === "data-apply" && parsed.confirmation !== `${manifest.manifestSha256}:DATA_APPLY`) {
    throw new Error("Data confirmation does not match the manifest");
  }
  const handler = active.commands?.[parsed.command];
  if (typeof handler !== "function") {
    throw new Error(`Promotion command handler is unavailable: ${parsed.command}`);
  }
  let raw;
  try {
    raw = await handler({
      command: parsed.command,
      manifest,
      manifestPath: parsed.manifestPath,
      confirmation: parsed.confirmation,
      access: WRITE_COMMANDS.has(parsed.command) ? "write" : "read",
    });
  } catch (error) {
    const message = redactSensitiveText(error?.message ?? String(error));
    if (/\bBLOCKED\b/iu.test(message)) raw = { status: "BLOCKED", reason: message };
    else throw error;
  }
  const summary = sanitize(raw);
  return { exitCode: exitCodeFor(summary), summary };
}

async function main() {
  try {
    const result = await runPromotionCommand({ argv: process.argv.slice(2) });
    process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: "FAILED_CONFIRMED", error: redactSensitiveText(error.message) })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
