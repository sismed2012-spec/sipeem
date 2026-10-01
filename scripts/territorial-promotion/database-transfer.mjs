import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";

import { classifySourceTables } from "./data-policy.mjs";
import { transitionJournal, validateJournal } from "./journal.mjs";
import {
  assertProjectRole,
  assertSafeOperation,
  buildSupabaseInvocation,
} from "./policy.mjs";
import { redactSensitiveText, runProcessOnce } from "./process.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;

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
  for (const table of classification.exclude) args.push("--exclude", table);
  args.push("--file", temporaryPath);
  const plan = {
    contractVersion: 1,
    artifactPath,
    temporaryPath,
    args,
    include: classification.include,
    exclude: classification.exclude,
    inventorySha256: classification.inventorySha256,
  };
  return { ...plan, planSha256: dumpPlanSha256(plan) };
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
    plan?.contractVersion !== 1 ||
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
  const metadata = await stat(plan.temporaryPath);
  if (!metadata.isFile() || metadata.size <= 0) {
    throw new Error("Data dump did not produce a non-empty temporary artifact");
  }
  const artifactSha256 = await fileSha256(plan.temporaryPath);
  await rename(plan.temporaryPath, plan.artifactPath);
  return {
    contractVersion: 1,
    path: plan.artifactPath,
    sha256: artifactSha256,
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

  if (typeof dependencies.getTargetConnection !== "function") {
    throw new Error("Target connection must be supplied by the operating-system secret provider");
  }
  const connection = await dependencies.getTargetConnection({
    projectRef: manifest.target.projectRef,
  });
  if (
    connection?.projectRef !== manifest.target.projectRef ||
    !connection.env ||
    typeof connection.env.PGPASSWORD !== "string" ||
    connection.env.PGPASSWORD.length === 0
  ) {
    throw new Error("Target connection identity or password is unavailable");
  }
  const applying = transitionJournal(journal, {
    to: "DATA_APPLYING",
    evidenceSha256: artifact.sha256,
  });
  await persist(dependencies.persistJournal, applying);
  const args = [
    "--single-transaction",
    "--set",
    "ON_ERROR_STOP=on",
    "--file",
    artifact.path,
  ];
  assertSafeOperation({
    phase: "data-apply",
    projectRef: manifest.target.projectRef,
    args,
  });
  const runner = dependencies.runProcessOnce ?? runProcessOnce;
  let result;
  try {
    result = await runner({
      command: "psql",
      args,
      env: connection.env,
      sensitiveValues: Object.values(connection.env),
    });
  } catch (error) {
    result = {
      exitCode: null,
      stdout: "",
      stderr: redactSensitiveText(error?.message ?? String(error), Object.values(connection.env)),
      errorCode: "RUNNER_ERROR",
    };
  }
  const next = transitionJournal(applying, {
    to: result?.exitCode === 0
      ? "DATA_APPLIED"
      : Number.isInteger(result?.exitCode)
        ? "FAILED_CONFIRMED"
        : "FAILED_UNKNOWN",
    evidenceSha256: processEvidence(result, Object.values(connection.env)),
  });
  return persist(dependencies.persistJournal, next);
}
