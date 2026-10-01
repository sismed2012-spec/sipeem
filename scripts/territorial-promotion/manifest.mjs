import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  SOURCE_PROJECT_REF,
  TARGET_PROJECT_REF,
  assertProjectRole,
} from "./policy.mjs";

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

export async function validatePromotionManifest(
  manifest,
  { repoRoot, currentCommit, isAncestor = async (ancestor, current) => ancestor === current },
) {
  if (manifest?.contractVersion !== 1 || manifest?.hashAlgorithm !== "sha256") {
    throw new Error("Unsupported promotion manifest contract");
  }
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

export async function loadPromotionManifest(filePath, context) {
  const manifest = JSON.parse(await readFile(filePath, "utf8"));
  await validatePromotionManifest(manifest, context);
  return manifest;
}

export { SOURCE_PROJECT_REF, TARGET_PROJECT_REF };
