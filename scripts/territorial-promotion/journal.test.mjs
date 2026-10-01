import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import {
  createJournal,
  createRecoveryJournal,
  loadJournal,
  saveJournalAtomically,
  transitionJournal,
  validateJournal,
} from "./journal.mjs";
import { SOURCE_PROJECT_REF, TARGET_PROJECT_REF } from "./policy.mjs";

const MANIFEST_SHA = "a".repeat(64);
const SOURCE_COMMIT = "b".repeat(40);
const EVIDENCE_SHA = "c".repeat(64);
const temporaryDirectories = [];

after(async () => {
  for (const directory of temporaryDirectories) {
    assert.ok(directory.startsWith(os.tmpdir()));
    await rm(directory, { recursive: true, force: true });
  }
});

function freshJournal() {
  return createJournal({
    manifestSha256: MANIFEST_SHA,
    sourceCommit: SOURCE_COMMIT,
    sourceRef: SOURCE_PROJECT_REF,
    targetRef: TARGET_PROJECT_REF,
  });
}

function advance(journal, to, extra = {}) {
  return transitionJournal(journal, {
    to,
    evidenceSha256: EVIDENCE_SHA,
    ...extra,
  });
}

test("advances through the approved sequence without mutating prior entries", () => {
  const created = freshJournal();
  const sequence = [
    "PREFLIGHT_PASSED",
    "SCHEMA_APPLYING",
    "SCHEMA_APPLIED",
    "DATA_APPLYING",
    "DATA_APPLIED",
    "VERIFYING",
    "VERIFIED",
    "PREVIEW_CUTOVER",
    "PREVIEW_VERIFIED",
    "PROD_CUTOVER",
    "COMPLETE",
  ];
  let current = created;
  for (const state of sequence) current = advance(current, state);

  assert.equal(created.state, "CREATED");
  assert.equal(created.entries.length, 1);
  assert.equal(current.state, "COMPLETE");
  assert.equal(current.entries.length, 12);
  assert.deepEqual(current.entries.map((entry) => entry.to), ["CREATED", ...sequence]);
});

test("rejects invalid transitions and treats confirmed failure as terminal", () => {
  assert.throws(() => advance(freshJournal(), "DATA_APPLIED"), /invalid transition/i);
  let journal = advance(freshJournal(), "PREFLIGHT_PASSED");
  journal = advance(journal, "SCHEMA_APPLYING");
  journal = advance(journal, "FAILED_CONFIRMED");
  assert.throws(() => advance(journal, "SCHEMA_APPLIED"), /invalid transition/i);
});

test("requires a probe before leaving BLOCKED or FAILED_UNKNOWN", () => {
  const blocked = advance(freshJournal(), "BLOCKED");
  assert.throws(() => advance(blocked, "PREFLIGHT_PASSED"), /probe resolution/i);
  assert.equal(
    advance(blocked, "PREFLIGHT_PASSED", { probeResolution: "credits-restored" }).state,
    "PREFLIGHT_PASSED",
  );

  let unknown = advance(freshJournal(), "PREFLIGHT_PASSED");
  unknown = advance(unknown, "SCHEMA_APPLYING");
  unknown = advance(unknown, "FAILED_UNKNOWN");
  assert.throws(() => advance(unknown, "SCHEMA_APPLIED"), /probe resolution/i);
  assert.equal(
    advance(unknown, "SCHEMA_APPLIED", { probeResolution: "all-migrations-present" }).state,
    "SCHEMA_APPLIED",
  );
});

test("persists atomically and rejects a journal for another identity", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "promotion-journal-"));
  temporaryDirectories.push(directory);
  const journalPath = path.join(directory, "nested", "journal.json");
  const journal = advance(freshJournal(), "PREFLIGHT_PASSED");

  await saveJournalAtomically(journalPath, journal);

  const loaded = await loadJournal(journalPath, {
    manifestSha256: MANIFEST_SHA,
    sourceCommit: SOURCE_COMMIT,
    sourceRef: SOURCE_PROJECT_REF,
    targetRef: TARGET_PROJECT_REF,
  });
  assert.deepEqual(loaded, journal);
  assert.equal((await readFile(journalPath, "utf8")).endsWith("\n"), true);
  await assert.rejects(access(`${journalPath}.tmp`));

  for (const expected of [
    { manifestSha256: "d".repeat(64) },
    { sourceCommit: "e".repeat(40) },
    { sourceRef: TARGET_PROJECT_REF },
    { targetRef: SOURCE_PROJECT_REF },
  ]) {
    assert.throws(
      () =>
        validateJournal(loaded, {
          manifestSha256: MANIFEST_SHA,
          sourceCommit: SOURCE_COMMIT,
          sourceRef: SOURCE_PROJECT_REF,
          targetRef: TARGET_PROJECT_REF,
          ...expected,
        }),
      /journal identity/i,
    );
  }
});

test("advances a recovery journal through schema adoption without reopening the predecessor", () => {
  let journal = createRecoveryJournal({
    manifestSha256: MANIFEST_SHA,
    sourceCommit: SOURCE_COMMIT,
    sourceRef: SOURCE_PROJECT_REF,
    targetRef: TARGET_PROJECT_REF,
    predecessorManifestSha256: "d".repeat(64),
  });
  for (const to of [
    "PREFLIGHT_PASSED",
    "SCHEMA_ADOPTING",
    "SCHEMA_APPLIED",
    "DATA_APPLYING",
    "DATA_APPLIED",
    "VERIFYING",
    "VERIFIED",
  ]) journal = advance(journal, to);

  assert.equal(journal.contractVersion, 2);
  assert.equal(journal.mode, "DATA_RECOVERY");
  assert.equal(journal.predecessorManifestSha256, "d".repeat(64));
  assert.equal(journal.state, "VERIFIED");
  assert.deepEqual(journal.entries.map(({ to }) => to), [
    "CREATED",
    "PREFLIGHT_PASSED",
    "SCHEMA_ADOPTING",
    "SCHEMA_APPLIED",
    "DATA_APPLYING",
    "DATA_APPLIED",
    "VERIFYING",
    "VERIFIED",
  ]);
});

test("keeps legacy and recovery schema paths mutually exclusive", () => {
  const legacy = advance(freshJournal(), "PREFLIGHT_PASSED");
  assert.throws(() => advance(legacy, "SCHEMA_ADOPTING"), /invalid transition/i);

  let recovery = createRecoveryJournal({
    manifestSha256: MANIFEST_SHA,
    sourceCommit: SOURCE_COMMIT,
    sourceRef: SOURCE_PROJECT_REF,
    targetRef: TARGET_PROJECT_REF,
    predecessorManifestSha256: "d".repeat(64),
  });
  recovery = advance(recovery, "PREFLIGHT_PASSED");
  assert.throws(() => advance(recovery, "SCHEMA_APPLYING"), /invalid transition/i);

  recovery = advance(recovery, "SCHEMA_ADOPTING");
  recovery = advance(recovery, "FAILED_CONFIRMED");
  assert.throws(() => advance(recovery, "SCHEMA_APPLIED"), /invalid transition/i);
});

test("persists and reloads the complete recovery identity", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "recovery-journal-"));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, "journal.json");
  const journal = createRecoveryJournal({
    manifestSha256: MANIFEST_SHA,
    sourceCommit: SOURCE_COMMIT,
    sourceRef: SOURCE_PROJECT_REF,
    targetRef: TARGET_PROJECT_REF,
    predecessorManifestSha256: "d".repeat(64),
  });
  await saveJournalAtomically(filePath, journal);
  const loaded = await loadJournal(filePath, {
    manifestSha256: MANIFEST_SHA,
    sourceCommit: SOURCE_COMMIT,
    sourceRef: SOURCE_PROJECT_REF,
    targetRef: TARGET_PROJECT_REF,
    mode: "DATA_RECOVERY",
    predecessorManifestSha256: "d".repeat(64),
  });
  assert.deepEqual(loaded, journal);
});
