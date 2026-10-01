import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, test } from "node:test";

import {
  buildPromotionManifest,
  loadPromotionManifest,
  validatePromotionManifest,
} from "./manifest.mjs";
import { SOURCE_PROJECT_REF, TARGET_PROJECT_REF } from "./policy.mjs";

const SOURCE_COMMIT = "a".repeat(40);
const EXPECTATIONS = {
  cartographyVersions: 1,
  sections: 7052,
  municipalities: 125,
  localDistricts: 45,
  federalDistricts: 40,
  ecegSections: 6544,
  nominalRows: 7191,
};
const temporaryDirectories = [];
let repoRoot;

after(async () => {
  for (const directory of temporaryDirectories) {
    assert.ok(directory.startsWith(os.tmpdir()));
    await rm(directory, { recursive: true, force: true });
  }
});

beforeEach(async () => {
  repoRoot = await mkdtemp(path.join(os.tmpdir(), "promotion-manifest-"));
  temporaryDirectories.push(repoRoot);
  const migrationDirectory = path.join(
    repoRoot,
    "infra",
    "territorial",
    "supabase",
    "migrations",
  );
  await mkdir(migrationDirectory, { recursive: true });
  for (let index = 1; index <= 49; index += 1) {
    await writeFile(
      path.join(
        migrationDirectory,
        `202609${String(index).padStart(8, "0")}_migration.sql`,
      ),
      `select ${index};\n`,
      "utf8",
    );
  }
});

async function buildManifest(overrides = {}) {
  return buildPromotionManifest({
    repoRoot,
    promotionId: "sipeem-territorial-prod-2026-10-01",
    createdAt: "2026-10-01T18:00:00.000Z",
    sourceCommit: SOURCE_COMMIT,
    sourceRef: SOURCE_PROJECT_REF,
    targetRef: TARGET_PROJECT_REF,
    sourcePostgres: "17.6",
    targetPostgres: "17.6",
    migrationDirectory: "infra/territorial/supabase/migrations",
    dataPolicy: { include: [], exclude: [] },
    expectations: EXPECTATIONS,
    ...overrides,
  });
}

test("builds a deterministic credential-free manifest with ordered file hashes", async () => {
  const first = await buildManifest();
  const second = await buildManifest();

  assert.deepEqual(first, second);
  assert.equal(first.contractVersion, 1);
  assert.equal(first.hashAlgorithm, "sha256");
  assert.equal(first.source.projectRef, SOURCE_PROJECT_REF);
  assert.equal(first.target.projectRef, TARGET_PROJECT_REF);
  assert.equal(first.sourceCommit, SOURCE_COMMIT);
  assert.deepEqual(first.expectations, EXPECTATIONS);
  assert.equal(first.migrations.length, 49);
  assert.equal(
    first.migrations[0].path,
    "infra/territorial/supabase/migrations/20260900000001_migration.sql",
  );
  assert.equal(
    first.migrations[0].sha256,
    "4a45092ccf992ea92250053a80b931b787924ba61648f420555511b84f10ab6c",
  );
  assert.match(first.manifestSha256, /^[a-f0-9]{64}$/u);
  assert.doesNotMatch(JSON.stringify(first), /password|service.?role|token|postgresql:\/\//iu);
});

test("rejects altered migration bytes, order, commit, and project references", async () => {
  const manifest = await buildManifest();
  const firstMigration = path.join(repoRoot, ...manifest.migrations[0].path.split("/"));
  await writeFile(firstMigration, "select 999;\n", "utf8");
  await assert.rejects(
    validatePromotionManifest(manifest, {
      repoRoot,
      currentCommit: SOURCE_COMMIT,
    }),
    /migration hash/i,
  );

  const fresh = await buildManifest();
  fresh.migrations.reverse();
  await assert.rejects(
    validatePromotionManifest(fresh, {
      repoRoot,
      currentCommit: SOURCE_COMMIT,
    }),
    /manifest checksum|migration order/i,
  );
  await assert.rejects(
    validatePromotionManifest(await buildManifest(), {
      repoRoot,
      currentCommit: "b".repeat(40),
    }),
    /source commit/i,
  );
  await assert.rejects(buildManifest({ sourceRef: TARGET_PROJECT_REF }), /source project/i);
  await assert.rejects(buildManifest({ targetRef: SOURCE_PROJECT_REF }), /target project/i);
});

test("permits a committed manifest only when its source commit is an ancestor", async () => {
  const manifest = await buildManifest();
  await assert.doesNotReject(
    validatePromotionManifest(manifest, {
      repoRoot,
      currentCommit: "c".repeat(40),
      isAncestor: async (ancestor, current) =>
        ancestor === SOURCE_COMMIT && current === "c".repeat(40),
    }),
  );
});

test("rejects secrets and loads only a fully validated JSON manifest", async () => {
  await assert.rejects(
    buildManifest({ dataPolicy: { password: "do-not-store" } }),
    /secret|credential/i,
  );

  const manifest = await buildManifest();
  const manifestPath = path.join(repoRoot, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const loaded = await loadPromotionManifest(manifestPath, {
    repoRoot,
    currentCommit: SOURCE_COMMIT,
  });
  assert.deepEqual(loaded, manifest);
  assert.equal((await readFile(manifestPath, "utf8")).endsWith("\n"), true);
});
