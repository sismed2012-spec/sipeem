import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { createJournal, transitionJournal } from "./journal.mjs";
import { buildPromotionManifest } from "./manifest.mjs";
import { SOURCE_PROJECT_REF, TARGET_PROJECT_REF } from "./policy.mjs";
import { freezeRecoveryManifest } from "./freeze-recovery-manifest.mjs";

const roots = [];
const expectations = {
  cartographyVersions: 2,
  sections: 7052,
  municipalities: 125,
  localDistricts: 45,
  federalDistricts: 40,
  ecegSections: 7052,
  nominalRows: 7052,
};

after(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
});

async function fixture() {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "freeze-recovery-"));
  roots.push(repoRoot);
  const migrationDirectory = "infra/territorial/supabase/migrations";
  const absoluteMigrations = path.join(repoRoot, ...migrationDirectory.split("/"));
  await mkdir(absoluteMigrations, { recursive: true });
  for (let index = 0; index < 49; index += 1) {
    await writeFile(
      path.join(absoluteMigrations, `${String(20260901000000 + index)}_migration.sql`),
      `select ${index};\n`,
      "utf8",
    );
  }
  const dataPolicy = { contractVersion: 2, include: [], exclude: [], preseeded: [] };
  const predecessorManifest = await buildPromotionManifest({
    repoRoot,
    promotionId: "predecessor",
    createdAt: "2026-10-01T00:00:00.000Z",
    sourceCommit: "a".repeat(40),
    sourceRef: SOURCE_PROJECT_REF,
    targetRef: TARGET_PROJECT_REF,
    sourcePostgres: "17.6",
    targetPostgres: "17.6",
    migrationDirectory,
    dataPolicy,
    expectations,
  });
  let predecessorJournal = createJournal({
    manifestSha256: predecessorManifest.manifestSha256,
    sourceCommit: predecessorManifest.sourceCommit,
    sourceRef: SOURCE_PROJECT_REF,
    targetRef: TARGET_PROJECT_REF,
  });
  predecessorJournal = transitionJournal(predecessorJournal, { to: "FAILED_CONFIRMED", evidenceSha256: "b".repeat(64) });
  const predecessorManifestPath = path.join(repoRoot, "predecessor.json");
  const predecessorJournalPath = path.join(repoRoot, "predecessor-journal.json");
  const dataPolicyPath = path.join(repoRoot, "data-policy.json");
  await writeFile(predecessorManifestPath, JSON.stringify(predecessorManifest), "utf8");
  await writeFile(predecessorJournalPath, JSON.stringify(predecessorJournal), "utf8");
  await writeFile(dataPolicyPath, JSON.stringify(dataPolicy), "utf8");
  return { repoRoot, migrationDirectory, predecessorManifestPath, predecessorJournalPath, dataPolicyPath };
}

test("freezes one immutable secret-free recovery manifest from explicit local evidence", async () => {
  const value = await fixture();
  const outputPath = path.join(value.repoRoot, "recovery.json");
  let remoteCalls = 0;
  const frozen = await freezeRecoveryManifest({
    outputPath,
    input: {
      ...value,
      promotionId: "recovery-01",
      createdAt: "2026-10-01T01:00:00.000Z",
      sourceCommit: "c".repeat(40),
      sourceRef: SOURCE_PROJECT_REF,
      targetRef: TARGET_PROJECT_REF,
      sourcePostgres: "17.6",
      targetPostgres: "17.6",
      expectations,
      rollbackEvidenceSha256: "d".repeat(64),
      preseededEvidenceSha256: "e".repeat(64),
    },
    context: { runProcessOnce: async () => { remoteCalls += 1; } },
  });
  assert.equal(frozen.contractVersion, 2);
  assert.equal(frozen.mode, "DATA_RECOVERY");
  assert.equal(remoteCalls, 0);
  const bytes = await readFile(outputPath, "utf8");
  assert.equal(JSON.parse(bytes).manifestSha256, frozen.manifestSha256);
  assert.doesNotMatch(bytes, /password|service.?role|token|postgresql:\/\//iu);
  await assert.rejects(
    freezeRecoveryManifest({ outputPath, input: { ...value }, context: {} }),
    /exists|overwrite/iu,
  );
});
