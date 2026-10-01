import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, test } from "node:test";

import {
  buildPromotionManifest,
  buildRecoveryManifest,
  loadPromotionManifest,
  validateRecoveryManifest,
  validatePromotionManifest,
} from "./manifest.mjs";
import { createJournal, transitionJournal } from "./journal.mjs";
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

function failedPredecessorJournal(predecessor) {
  let journal = createJournal({
    manifestSha256: predecessor.manifestSha256,
    sourceCommit: predecessor.sourceCommit,
    sourceRef: predecessor.source.projectRef,
    targetRef: predecessor.target.projectRef,
  });
  for (const to of [
    "PREFLIGHT_PASSED",
    "SCHEMA_APPLYING",
    "SCHEMA_APPLIED",
    "DATA_APPLYING",
    "FAILED_CONFIRMED",
  ]) {
    journal = transitionJournal(journal, { to, evidenceSha256: "e".repeat(64) });
  }
  return journal;
}

async function buildRecovery(overrides = {}) {
  const predecessorManifest = await buildManifest();
  const predecessorJournal = failedPredecessorJournal(predecessorManifest);
  return buildRecoveryManifest({
    repoRoot,
    promotionId: "sipeem-territorial-prod-recovery-2026-10-01-01",
    createdAt: "2026-10-01T19:00:00.000Z",
    sourceCommit: "c".repeat(40),
    sourceRef: SOURCE_PROJECT_REF,
    targetRef: TARGET_PROJECT_REF,
    sourcePostgres: "17.6",
    targetPostgres: "17.6",
    migrationDirectory: "infra/territorial/supabase/migrations",
    dataPolicy: { contractVersion: 2, include: [], exclude: [], preseeded: [] },
    expectations: EXPECTATIONS,
    predecessorManifest,
    predecessorJournal,
    rollbackEvidenceSha256: "d".repeat(64),
    preseededEvidenceSha256: "f".repeat(64),
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

test("builds a distinct immutable DATA_RECOVERY manifest linked to terminal evidence", async () => {
  const predecessorManifest = await buildManifest();
  const recovery = await buildRecovery({
    predecessorManifest,
    predecessorJournal: failedPredecessorJournal(predecessorManifest),
  });

  assert.equal(recovery.contractVersion, 2);
  assert.equal(recovery.mode, "DATA_RECOVERY");
  assert.equal(recovery.recovery.predecessorManifestSha256, predecessorManifest.manifestSha256);
  assert.equal(recovery.recovery.predecessorTerminalState, "FAILED_CONFIRMED");
  assert.equal(recovery.recovery.cause, "PRESEEDED_TABLE_COLLISION");
  assert.equal(recovery.recovery.rollbackEvidenceSha256, "d".repeat(64));
  assert.equal(recovery.recovery.preseededEvidenceSha256, "f".repeat(64));
  assert.deepEqual(recovery.migrations, predecessorManifest.migrations);
  assert.deepEqual(recovery.expectations, predecessorManifest.expectations);
  assert.notEqual(recovery.manifestSha256, predecessorManifest.manifestSha256);
  assert.doesNotMatch(JSON.stringify(recovery), /password|service.?role|token|postgresql:\/\//iu);
});

test("rejects invalid or mismatched recovery predecessors and evidence", async () => {
  const predecessorManifest = await buildManifest();
  const predecessorJournal = failedPredecessorJournal(predecessorManifest);
  let nonterminal = createJournal({
    manifestSha256: predecessorManifest.manifestSha256,
    sourceCommit: predecessorManifest.sourceCommit,
    sourceRef: SOURCE_PROJECT_REF,
    targetRef: TARGET_PROJECT_REF,
  });
  nonterminal = transitionJournal(nonterminal, {
    to: "PREFLIGHT_PASSED",
    evidenceSha256: "e".repeat(64),
  });

  for (const [overrides, expected] of [
    [{ predecessorManifest: null }, /predecessor/iu],
    [{ predecessorJournal: nonterminal }, /failed_confirmed|terminal/iu],
    [{ predecessorJournal: { ...predecessorJournal, manifestSha256: "1".repeat(64) } }, /journal|manifest/iu],
    [{ rollbackEvidenceSha256: "bad" }, /evidence|sha/iu],
    [{ preseededEvidenceSha256: "bad" }, /evidence|sha/iu],
    [{ sourceRef: TARGET_PROJECT_REF }, /source project/iu],
    [{ targetRef: SOURCE_PROJECT_REF }, /target project/iu],
    [{ dataPolicy: { contractVersion: 2, password: "do-not-store" } }, /secret|credential/iu],
  ]) {
    await assert.rejects(buildRecovery(overrides), expected);
  }
});

test("validates recovery only through an exact loaded predecessor", async () => {
  const predecessorManifest = await buildManifest();
  const predecessorJournal = failedPredecessorJournal(predecessorManifest);
  const recovery = await buildRecovery({ predecessorManifest, predecessorJournal });
  const context = {
    repoRoot,
    currentCommit: "d".repeat(40),
    isAncestor: async (ancestor, current) =>
      ancestor === recovery.sourceCommit && current === "d".repeat(40),
    loadPredecessor: async () => ({ predecessorManifest, predecessorJournal }),
  };

  await assert.doesNotReject(validateRecoveryManifest(recovery, context));
  await assert.rejects(
    validateRecoveryManifest(recovery, { ...context, loadPredecessor: undefined }),
    /predecessor/iu,
  );
  await writeFile(
    path.join(repoRoot, ...recovery.migrations[0].path.split("/")),
    "select 999;\n",
    "utf8",
  );
  await assert.rejects(validateRecoveryManifest(recovery, context), /migration hash/iu);
});
