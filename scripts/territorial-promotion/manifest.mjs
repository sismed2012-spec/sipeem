import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  SOURCE_PROJECT_REF,
  TARGET_PROJECT_REF,
  assertProjectRole,
} from "./policy.mjs";
import { validateJournal } from "./journal.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const MIGRATION_NAME = /^202609\d{8}_[a-z0-9_]+\.sql$/u;
const SECRET_KEY = /password|token|api.?key|service.?role|database.?url/iu;
const SECRET_VALUE = /(?:postgres(?:ql)?:\/\/[^\s]+:[^@\s]+@|sb_secret_|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.)/u;

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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || path.isAbsolute(value)) {
    throw new Error("Manifest paths must be non-empty and relative");
  }
  const normalized = value.replaceAll("\\", "/");
  if (normalized.split("/").includes("..")) {
    throw new Error("Manifest paths cannot escape the repository");
  }
  return normalized;
}

function assertSecretFree(value, location = "manifest") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSecretFree(item, `${location}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (SECRET_KEY.test(key)) {
        throw new Error(`Secret or credential field is forbidden at ${location}.${key}`);
      }
      assertSecretFree(item, `${location}.${key}`);
    }
    return;
  }
  if (typeof value === "string" && SECRET_VALUE.test(value)) {
    throw new Error(`Secret or credential value is forbidden at ${location}`);
  }
}

export function computeManifestSha256(manifest) {
  const content = structuredClone(manifest);
  delete content.manifestSha256;
  return sha256(canonicalJson(content));
}

function assertExpectations(expectations) {
  const required = [
    "cartographyVersions",
    "sections",
    "municipalities",
    "localDistricts",
    "federalDistricts",
    "ecegSections",
    "nominalRows",
  ];
  for (const key of required) {
    if (!Number.isSafeInteger(expectations?.[key]) || expectations[key] < 0) {
      throw new Error(`Manifest expectation ${key} must be a non-negative integer`);
    }
  }
}

export async function buildPromotionManifest({
  repoRoot,
  promotionId,
  createdAt,
  sourceCommit,
  sourceRef,
  targetRef,
  sourcePostgres,
  targetPostgres,
  migrationDirectory,
  dataPolicy,
  expectations,
}) {
  assertProjectRole({ projectRef: sourceRef, role: "source", access: "read" });
  assertProjectRole({ projectRef: targetRef, role: "target", access: "read" });
  if (!COMMIT.test(sourceCommit)) throw new Error("sourceCommit must be a full SHA-1");
  if (typeof promotionId !== "string" || promotionId.trim() !== promotionId || !promotionId) {
    throw new Error("promotionId must be a non-empty canonical string");
  }
  if (new Date(createdAt).toISOString() !== createdAt) {
    throw new Error("createdAt must be an ISO timestamp");
  }
  assertExpectations(expectations);
  assertSecretFree(dataPolicy, "dataPolicy");

  const relativeMigrationDirectory = normalizeRelativePath(migrationDirectory);
  const absoluteMigrationDirectory = path.resolve(
    repoRoot,
    ...relativeMigrationDirectory.split("/"),
  );
  const names = (await readdir(absoluteMigrationDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && MIGRATION_NAME.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (names.length !== 49) {
    throw new Error(`Expected 49 territorial migrations, found ${names.length}`);
  }
  const migrations = await Promise.all(
    names.map(async (name) => {
      const relativePath = `${relativeMigrationDirectory}/${name}`;
      const contents = await readFile(path.join(absoluteMigrationDirectory, name));
      return { path: relativePath, sha256: sha256(contents) };
    }),
  );

  const manifest = {
    contractVersion: 1,
    hashAlgorithm: "sha256",
    promotionId,
    createdAt,
    sourceCommit,
    source: { projectRef: sourceRef, postgresVersion: sourcePostgres },
    target: { projectRef: targetRef, postgresVersion: targetPostgres },
    migrations,
    dataPolicy: structuredClone(dataPolicy),
    expectations: structuredClone(expectations),
  };
  assertSecretFree(manifest);
  return { ...manifest, manifestSha256: computeManifestSha256(manifest) };
}

function assertRecoveryEvidence({ predecessorManifest, predecessorJournal, sourceRef, targetRef, rollbackEvidenceSha256, preseededEvidenceSha256 }) {
  if (predecessorManifest?.contractVersion !== 1 || !SHA256.test(predecessorManifest?.manifestSha256 ?? "")) {
    throw new Error("Recovery requires a valid predecessor manifest");
  }
  validateJournal(predecessorJournal, {
    manifestSha256: predecessorManifest.manifestSha256,
    sourceCommit: predecessorManifest.sourceCommit,
    sourceRef: predecessorManifest.source?.projectRef,
    targetRef: predecessorManifest.target?.projectRef,
  });
  if (predecessorJournal.state !== "FAILED_CONFIRMED") {
    throw new Error("Recovery predecessor journal must be terminal FAILED_CONFIRMED");
  }
  if (
    predecessorManifest.source?.projectRef !== sourceRef ||
    predecessorJournal.sourceRef !== sourceRef
  ) {
    throw new Error("Recovery predecessor source project reference does not match");
  }
  if (
    predecessorManifest.target?.projectRef !== targetRef ||
    predecessorJournal.targetRef !== targetRef
  ) {
    throw new Error("Recovery predecessor target project reference does not match");
  }
  if (!SHA256.test(rollbackEvidenceSha256 ?? "") || !SHA256.test(preseededEvidenceSha256 ?? "")) {
    throw new Error("Recovery evidence must use SHA-256");
  }
}

export async function buildRecoveryManifest({
  predecessorManifest,
  predecessorJournal,
  rollbackEvidenceSha256,
  preseededEvidenceSha256,
  ...input
}) {
  assertRecoveryEvidence({
    predecessorManifest,
    predecessorJournal,
    sourceRef: input.sourceRef,
    targetRef: input.targetRef,
    rollbackEvidenceSha256,
    preseededEvidenceSha256,
  });
  await validatePromotionManifest(predecessorManifest, {
    repoRoot: input.repoRoot,
    currentCommit: predecessorManifest.sourceCommit,
  });
  const base = await buildPromotionManifest(input);
  if (
    canonicalJson(base.migrations) !== canonicalJson(predecessorManifest.migrations) ||
    canonicalJson(base.expectations) !== canonicalJson(predecessorManifest.expectations)
  ) {
    throw new Error("Recovery schema and expectations must match the predecessor manifest");
  }
  const recoveryManifest = {
    ...base,
    contractVersion: 2,
    mode: "DATA_RECOVERY",
    recovery: {
      predecessorManifestSha256: predecessorManifest.manifestSha256,
      predecessorTerminalState: "FAILED_CONFIRMED",
      cause: "PRESEEDED_TABLE_COLLISION",
      rollbackEvidenceSha256,
      preseededEvidenceSha256,
    },
  };
  delete recoveryManifest.manifestSha256;
  assertSecretFree(recoveryManifest);
  return {
    ...recoveryManifest,
    manifestSha256: computeManifestSha256(recoveryManifest),
  };
}

async function validateManifestCore(
  manifest,
  { repoRoot, currentCommit, isAncestor = async (ancestor, current) => ancestor === current },
) {
  assertSecretFree(manifest);
  assertProjectRole({
    projectRef: manifest.source?.projectRef,
    role: "source",
    access: "read",
  });
  assertProjectRole({
    projectRef: manifest.target?.projectRef,
    role: "target",
    access: "read",
  });
  if (!COMMIT.test(manifest.sourceCommit) || !COMMIT.test(currentCommit)) {
    throw new Error("Manifest source commit must be a full SHA-1");
  }
  if (!(await isAncestor(manifest.sourceCommit, currentCommit))) {
    throw new Error("Manifest source commit is not the current commit or its ancestor");
  }
  assertExpectations(manifest.expectations);
  if (!Array.isArray(manifest.migrations) || manifest.migrations.length !== 49) {
    throw new Error("Manifest must contain exactly 49 migrations");
  }
  const paths = manifest.migrations.map((migration) =>
    normalizeRelativePath(migration.path),
  );
  const sortedPaths = [...paths].sort();
  if (new Set(paths).size !== paths.length || paths.some((value, index) => value !== sortedPaths[index])) {
    throw new Error("Manifest migration order must be unique and lexicographic");
  }
  const root = path.resolve(repoRoot);
  for (const [index, migration] of manifest.migrations.entries()) {
    if (!SHA256.test(migration.sha256)) {
      throw new Error(`Invalid migration hash at index ${index}`);
    }
    const filePath = path.resolve(root, ...paths[index].split("/"));
    if (!filePath.startsWith(`${root}${path.sep}`)) {
      throw new Error("Migration path escapes the repository");
    }
    const actual = sha256(await readFile(filePath));
    if (actual !== migration.sha256) {
      throw new Error(`Migration hash mismatch: ${paths[index]}`);
    }
  }
  if (!SHA256.test(manifest.manifestSha256)) {
    throw new Error("Manifest checksum must be SHA-256");
  }
  if (computeManifestSha256(manifest) !== manifest.manifestSha256) {
    throw new Error("Manifest checksum mismatch");
  }
}

export async function validatePromotionManifest(
  manifest,
  context,
) {
  if (manifest?.contractVersion !== 1 || manifest?.hashAlgorithm !== "sha256") {
    throw new Error("Unsupported promotion manifest contract");
  }
  await validateManifestCore(manifest, context);
}

export async function validateRecoveryManifest(manifest, context) {
  if (
    manifest?.contractVersion !== 2 ||
    manifest?.hashAlgorithm !== "sha256" ||
    manifest?.mode !== "DATA_RECOVERY"
  ) {
    throw new Error("Unsupported recovery manifest contract");
  }
  const recovery = manifest.recovery;
  if (
    !SHA256.test(recovery?.predecessorManifestSha256 ?? "") ||
    recovery?.predecessorTerminalState !== "FAILED_CONFIRMED" ||
    recovery?.cause !== "PRESEEDED_TABLE_COLLISION" ||
    !SHA256.test(recovery?.rollbackEvidenceSha256 ?? "") ||
    !SHA256.test(recovery?.preseededEvidenceSha256 ?? "")
  ) {
    throw new Error("Invalid recovery manifest evidence");
  }
  await validateManifestCore(manifest, context);
  if (typeof context?.loadPredecessor !== "function") {
    throw new Error("Recovery predecessor loader is required");
  }
  const loaded = await context.loadPredecessor(recovery.predecessorManifestSha256);
  const predecessorManifest = loaded?.predecessorManifest;
  const predecessorJournal = loaded?.predecessorJournal;
  assertRecoveryEvidence({
    predecessorManifest,
    predecessorJournal,
    sourceRef: manifest.source.projectRef,
    targetRef: manifest.target.projectRef,
    rollbackEvidenceSha256: recovery.rollbackEvidenceSha256,
    preseededEvidenceSha256: recovery.preseededEvidenceSha256,
  });
  if (predecessorManifest.manifestSha256 !== recovery.predecessorManifestSha256) {
    throw new Error("Recovery predecessor manifest hash does not match");
  }
  await validatePromotionManifest(predecessorManifest, {
    repoRoot: context.repoRoot,
    currentCommit: predecessorManifest.sourceCommit,
  });
  if (
    canonicalJson(predecessorManifest.migrations) !== canonicalJson(manifest.migrations) ||
    canonicalJson(predecessorManifest.expectations) !== canonicalJson(manifest.expectations)
  ) {
    throw new Error("Recovery manifest does not match predecessor schema or expectations");
  }
}

export async function loadPromotionManifest(filePath, context) {
  const manifest = JSON.parse(await readFile(filePath, "utf8"));
  if (manifest?.contractVersion === 2) await validateRecoveryManifest(manifest, context);
  else await validatePromotionManifest(manifest, context);
  return manifest;
}

export { SOURCE_PROJECT_REF, TARGET_PROJECT_REF };
