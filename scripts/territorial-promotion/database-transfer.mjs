import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, appendFile, mkdir, open, rename, stat, unlink } from "node:fs/promises";
import readline from "node:readline";
import path from "node:path";

import { classifySourceTables } from "./data-policy.mjs";
import { transitionJournal, validateJournal } from "./journal.mjs";
import {
  assertProjectRole,
  assertSafeOperation,
  buildSupabaseInvocation,
} from "./policy.mjs";
import {
  normalizeProcessFailure,
  persistFailureEvidence,
  redactSensitiveText,
  runProcessOnce,
} from "./process.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const POSTGRES_CLIENT_IMAGE = "public.ecr.aws/supabase/postgres:17.11.0.002";
const CONTAINER_ARTIFACT_PATH = "/transfer/territorial-data.sql";

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
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function dumpPlanSha256(plan) {
  const content = structuredClone(plan);
  delete content.planSha256;
  return evidence(content);
}

async function fileSha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function buildDumpPlan({ inventory, dataPolicy, artifactPath }) {
  if (typeof artifactPath !== "string" || !path.isAbsolute(artifactPath)) {
    throw new Error("Data artifact path must be absolute");
  }
  const classification = classifySourceTables({ inventory, dataPolicy });
  const temporaryPath = `${artifactPath}.tmp`;
  const args = ["db", "dump", "--data-only", "--use-copy", "--schema", "public"];
  for (const table of classification.excludedFromDump) args.push("--exclude", table);
  args.push("--file", temporaryPath);
  const plan = {
    contractVersion: 2,
    artifactPath,
    temporaryPath,
    args,
    include: classification.include,
    exclude: classification.exclude,
    preseeded: classification.preseeded,
    restoreTransforms: classification.restoreTransforms,
    inventorySha256: classification.inventorySha256,
  };
  return { ...plan, planSha256: dumpPlanSha256(plan) };
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function quoteQualifiedName(value) {
  return String(value).split(".").map(quoteIdentifier).join(".");
}

function renderRestoreTransforms(transforms) {
  if (!Array.isArray(transforms) || transforms.length === 0) return "";
  return transforms.map((transform) => {
    if (transform.type !== "null_orphan_reference") {
      throw new Error(`Unsupported restore transform: ${String(transform.type)}`);
    }
    const table = quoteQualifiedName(transform.table);
    const column = quoteIdentifier(transform.column);
    const referencedTable = quoteQualifiedName(transform.referencedTable);
    const referencedColumn = quoteIdentifier(transform.referencedColumn);
    return [
      "",
      "-- Reviewed restore transform: preserve canonical rows and clear excluded provenance.",
      `UPDATE ${table} AS target`,
      `SET ${column} = NULL`,
      `WHERE target.${column} IS NOT NULL`,
      `  AND NOT EXISTS (SELECT 1 FROM ${referencedTable} AS referenced`,
      `                  WHERE referenced.${referencedColumn} = target.${column});`,
      "",
    ].join("\n");
  }).join("");
}

function normalizedIdentifier(value) {
  return String(value).replaceAll('"', "").toLowerCase();
}

export async function lintDataArtifact({ artifactPath, preseeded }) {
  if (typeof artifactPath !== "string" || !path.isAbsolute(artifactPath)) {
    throw new Error("Artifact lint path must be absolute");
  }
  if (!Array.isArray(preseeded)) throw new Error("Artifact lint requires preseeded metadata");
  const tables = preseeded.map(({ table }) => normalizedIdentifier(table));
  const sequences = preseeded.flatMap(({ ownedSequences = [] }) => ownedSequences.map(normalizedIdentifier));
  const input = createReadStream(artifactPath, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;
  try {
    for await (const rawLine of lines) {
      lineNumber += 1;
      const line = normalizedIdentifier(rawLine).trimStart();
      const dataStatement = /^(?:copy\s+|insert\s+into\s+)/u.test(line);
      if (dataStatement && tables.some((table) => line.startsWith(`copy ${table}`) || line.startsWith(`insert into ${table}`))) {
        throw new Error(`Forbidden preseeded table statement at line ${lineNumber}`);
      }
      if (/\bsetval\s*\(/u.test(line) && sequences.some((sequence) => line.includes(sequence))) {
        throw new Error(`Forbidden preseeded sequence statement at line ${lineNumber}`);
      }
    }
  } finally {
    lines.close();
    input.destroy();
  }
  const artifactSha256 = await fileSha256(artifactPath);
  return {
    status: "PASSED",
    evidenceSha256: evidence({ artifactSha256, tables: tables.sort(), sequences: sequences.sort() }),
  };
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

export async function createDataArtifact({
  plan,
  manifest,
  repoRoot = process.cwd(),
  dependencies = {},
}) {
  assertProjectRole({
    projectRef: manifest?.source?.projectRef,
    role: "source",
    access: "read",
  });
  if (!SHA256.test(manifest?.manifestSha256 ?? "")) {
    throw new Error("Data artifact requires a valid manifest hash");
  }
  if (
    plan?.contractVersion !== 2 ||
    !Array.isArray(plan?.args) ||
    !SHA256.test(plan?.inventorySha256 ?? "") ||
    !SHA256.test(plan?.planSha256 ?? "") ||
    dumpPlanSha256(plan) !== plan.planSha256
  ) {
    throw new Error("Dump plan integrity check failed");
  }
  const docker = await (dependencies.dockerHealth ?? defaultDockerHealth)();
  if (!docker?.available) {
    throw new Error(`Docker BLOCKED: ${docker?.detail || "daemon unavailable"}`);
  }
  if (await pathExists(plan.artifactPath)) {
    throw new Error("Data artifact already exists and will not be overwritten");
  }
  if (await pathExists(plan.temporaryPath)) {
    throw new Error("Temporary data artifact already exists and requires review");
  }
  await mkdir(path.dirname(plan.artifactPath), { recursive: true });

  assertSafeOperation({
    phase: "data-plan",
    projectRef: manifest.source.projectRef,
    args: plan.args,
  });
  const invocation = buildSupabaseInvocation({
    args: plan.args,
    projectRef: manifest.source.projectRef,
  });
  const runner = dependencies.runProcessOnce ?? runProcessOnce;
  let result;
  try {
    result = await runner({ ...invocation, cwd: repoRoot });
  } catch (error) {
    throw new Error(`Data dump failed once: ${redactSensitiveText(error?.message ?? String(error))}`);
  }
  if (result?.exitCode !== 0) {
    throw new Error(`Data dump failed once: ${redactSensitiveText(result?.stderr || "unknown failure")}`);
  }
  const transformSql = renderRestoreTransforms(plan.restoreTransforms);
  if (transformSql) await appendFile(plan.temporaryPath, transformSql, "utf8");
  const metadata = await stat(plan.temporaryPath);
  if (!metadata.isFile() || metadata.size <= 0) {
    throw new Error("Data dump did not produce a non-empty temporary artifact");
  }
  const lint = await lintDataArtifact({ artifactPath: plan.temporaryPath, preseeded: plan.preseeded });
  const artifactSha256 = await fileSha256(plan.temporaryPath);
  await rename(plan.temporaryPath, plan.artifactPath);
  return {
    contractVersion: 1,
    path: plan.artifactPath,
    sha256: artifactSha256,
    lintEvidenceSha256: lint.evidenceSha256,
    sizeBytes: metadata.size,
    manifestSha256: manifest.manifestSha256,
    sourceProjectRef: manifest.source.projectRef,
    inventorySha256: plan.inventorySha256,
    createdAt: new Date().toISOString(),
  };
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

async function validateArtifact(artifact, manifest) {
  if (artifact?.contractVersion !== 1) {
    throw new Error("Unsupported data artifact contract");
  }
  if (
    artifact?.manifestSha256 !== manifest.manifestSha256 ||
    artifact?.sourceProjectRef !== manifest.source?.projectRef ||
    !SHA256.test(artifact?.sha256 ?? "") ||
    !SHA256.test(artifact?.lintEvidenceSha256 ?? "") ||
    !Number.isSafeInteger(artifact?.sizeBytes) ||
    artifact.sizeBytes <= 0 ||
    typeof artifact?.path !== "string" ||
    !path.isAbsolute(artifact.path)
  ) {
    throw new Error("Data artifact identity does not match the manifest");
  }
  const metadata = await stat(artifact.path);
  if (!metadata.isFile() || metadata.size !== artifact.sizeBytes) {
    throw new Error("Data artifact size mismatch");
  }
  if ((await fileSha256(artifact.path)) !== artifact.sha256) {
    throw new Error("Data artifact checksum mismatch");
  }
}

async function persist(persistJournal, journal) {
  if (typeof persistJournal !== "function") {
    throw new Error("Data restoration requires durable journal persistence");
  }
  await persistJournal(journal);
  return journal;
}

async function resumeDataRestore({ manifest, journal, dependencies }) {
  const last = journal.entries.at(-1);
  if (
    journal.state === "FAILED_UNKNOWN" &&
    last?.from !== "DATA_APPLYING"
  ) {
    throw new Error("FAILED_UNKNOWN belongs to another promotion phase");
  }
  if (typeof dependencies.probeDataState !== "function") {
    throw new Error("An unresolved data restore requires a data-state probe");
  }
  const probe = await dependencies.probeDataState({
    projectRef: manifest.target.projectRef,
    manifest,
  });
  let next = journal;
  const resolution = `data-probe:${probe.status.toLowerCase()}`;
  if (probe.status === "COMPLETE") {
    next = transitionJournal(journal, {
      to: "DATA_APPLIED",
      evidenceSha256: probe.evidenceSha256,
      probeResolution: journal.state === "FAILED_UNKNOWN" || journal.state === "BLOCKED" ? resolution : null,
    });
  } else if (probe.status === "ABSENT") {
    next = transitionJournal(journal, {
      to: "FAILED_CONFIRMED",
      evidenceSha256: probe.evidenceSha256,
      probeResolution: journal.state === "FAILED_UNKNOWN" || journal.state === "BLOCKED" ? resolution : null,
    });
  } else if (journal.state === "DATA_APPLYING") {
    next = transitionJournal(journal, {
      to: "FAILED_UNKNOWN",
      evidenceSha256: probe.evidenceSha256,
    });
  }
  if (next !== journal) await persist(dependencies.persistJournal, next);
  return next;
}

function processEvidence(result, sensitiveValues = []) {
  return evidence({
    exitCode: result?.exitCode ?? null,
    errorCode: result?.errorCode ?? null,
    stdout: redactSensitiveText(result?.stdout ?? "", sensitiveValues),
    stderr: redactSensitiveText(result?.stderr ?? "", sensitiveValues),
  });
}

function assertTargetConnectionIdentity(connection, expectedProjectRef) {
  const env = connection?.env;
  if (
    connection?.projectRef !== expectedProjectRef ||
    !env ||
    typeof env.PGPASSWORD !== "string" ||
    env.PGPASSWORD.length === 0
  ) {
    throw new Error("Target connection identity or password is unavailable");
  }

  const host = typeof env.PGHOST === "string"
    ? env.PGHOST.trim().toLowerCase().replace(/\.$/u, "")
    : "";
  const user = typeof env.PGUSER === "string" ? env.PGUSER.trim() : "";
  const directHost = `db.${expectedProjectRef}.supabase.co`;
  const direct = host === directHost && user === "postgres";
  const pooler = /^[a-z0-9.-]+\.pooler\.supabase\.com$/u.test(host) &&
    user === `postgres.${expectedProjectRef}`;

  if (!direct && !pooler) {
    throw new Error("Target database endpoint is not bound to the target project");
  }

  const sslMode = typeof env.PGSSLMODE === "string"
    ? env.PGSSLMODE.trim().toLowerCase()
    : "";
  if (!["require", "verify-ca", "verify-full"].includes(sslMode)) {
    throw new Error("Target database connection requires secure PGSSLMODE=require or stronger");
  }
}

export async function restoreDataArtifactOnce({
  artifact,
  manifest,
  journal,
  confirmation,
  dependencies = {},
}) {
  validateJournal(journal, journalIdentity(manifest));
  assertProjectRole({
    projectRef: manifest.target?.projectRef,
    role: "target",
    access: "write",
  });
  if (confirmation !== `${manifest.manifestSha256}:DATA_APPLY`) {
    throw new Error("Data restoration confirmation does not match the manifest");
  }
  await validateArtifact(artifact, manifest);
  if (journal.state === "DATA_APPLIED") return journal;
  if (["DATA_APPLYING", "FAILED_UNKNOWN", "BLOCKED"].includes(journal.state)) {
    return resumeDataRestore({ manifest, journal, dependencies });
  }
  if (journal.state !== "SCHEMA_APPLIED") {
    throw new Error(`Data restoration cannot start from ${journal.state}`);
  }

  const lockPath = `${artifact.path}.apply.lock`;
  let lock;
  try {
    lock = await open(lockPath, "wx");
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error("Data restoration is already claimed by an exclusive process");
    }
    throw error;
  }

  try {
    if (typeof dependencies.reloadJournal !== "function") {
      throw new Error("Data restoration requires a durable journal reload after claiming exclusivity");
    }
    const durableJournal = await dependencies.reloadJournal();
    validateJournal(durableJournal, journalIdentity(manifest));
    if (durableJournal.state === "DATA_APPLIED") return durableJournal;
    if (durableJournal.state !== journal.state) {
      throw new Error(`Data restoration rejected a stale exclusive claim from ${journal.state} to ${durableJournal.state}`);
    }
    if (typeof dependencies.getTargetConnection !== "function") {
      throw new Error("Target connection must be supplied by the operating-system secret provider");
    }
    const connection = await dependencies.getTargetConnection({
      projectRef: manifest.target.projectRef,
    });
    assertTargetConnectionIdentity(connection, manifest.target.projectRef);
    const applying = transitionJournal(journal, {
      to: "DATA_APPLYING",
      evidenceSha256: artifact.sha256,
    });
    await persist(dependencies.persistJournal, applying);
    const psqlArgs = [
    "--single-transaction",
    "--set",
    "ON_ERROR_STOP=on",
    "--set",
    "VERBOSITY=verbose",
    "--file",
    CONTAINER_ARTIFACT_PATH,
  ];
    assertSafeOperation({
    phase: "data-apply",
    projectRef: manifest.target.projectRef,
    args: psqlArgs,
  });
    const args = [
    "run",
    "--rm",
    "--network",
    "host",
    "-e",
    "PGHOST",
    "-e",
    "PGPORT",
    "-e",
    "PGUSER",
    "-e",
    "PGDATABASE",
    "-e",
    "PGPASSWORD",
    "-e",
    "PGSSLMODE",
    "--mount",
    `type=bind,source=${artifact.path},target=${CONTAINER_ARTIFACT_PATH},readonly`,
    POSTGRES_CLIENT_IMAGE,
    "psql",
    ...psqlArgs,
  ];
    const runner = dependencies.runProcessOnce ?? runProcessOnce;
    const sensitiveValues = Object.values(connection.env).filter(
    (value) => typeof value === "string" && value.length > 0,
  );
    let result;
    try {
      result = await runner({
      command: "docker",
      args,
      env: connection.env,
      sensitiveValues,
    });
    } catch (error) {
      result = {
      exitCode: null,
      stdout: "",
      stderr: redactSensitiveText(error?.message ?? String(error), sensitiveValues),
      errorCode: "RUNNER_ERROR",
    };
    }
    let transitionEvidence = processEvidence(result, sensitiveValues);
    if (result?.exitCode !== 0) {
      const failure = normalizeProcessFailure({
      phase: "data-apply",
      result,
      sensitiveValues,
    });
      const persistFailure = dependencies.persistFailureEvidence ?? persistFailureEvidence;
      const saved = await persistFailure(path.join(path.dirname(artifact.path), "failure.json"), failure);
      transitionEvidence = saved.sha256;
    }
    const next = transitionJournal(applying, {
    to: result?.exitCode === 0
      ? "DATA_APPLIED"
      : Number.isInteger(result?.exitCode)
        ? "FAILED_CONFIRMED"
        : "FAILED_UNKNOWN",
    evidenceSha256: transitionEvidence,
    });
    return persist(dependencies.persistJournal, next);
  } finally {
    await lock.close();
    await unlink(lockPath).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
}
