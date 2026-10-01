import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { assertProjectRole } from "./policy.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const RECOVERY_STATES = new Set(["BLOCKED", "FAILED_UNKNOWN"]);
const LEGACY_TRANSITIONS = new Map([
  ["CREATED", new Set(["PREFLIGHT_PASSED", "BLOCKED", "FAILED_CONFIRMED"])],
  ["PREFLIGHT_PASSED", new Set(["SCHEMA_APPLYING", "BLOCKED", "FAILED_CONFIRMED"])],
  ["SCHEMA_APPLYING", new Set(["SCHEMA_APPLIED", "BLOCKED", "FAILED_CONFIRMED", "FAILED_UNKNOWN"])],
  ["SCHEMA_APPLIED", new Set(["DATA_APPLYING", "BLOCKED", "FAILED_CONFIRMED"])],
  ["DATA_APPLYING", new Set(["DATA_APPLIED", "BLOCKED", "FAILED_CONFIRMED", "FAILED_UNKNOWN"])],
  ["DATA_APPLIED", new Set(["VERIFYING", "BLOCKED", "FAILED_CONFIRMED"])],
  ["VERIFYING", new Set(["VERIFIED", "BLOCKED", "FAILED_CONFIRMED", "FAILED_UNKNOWN"])],
  ["VERIFIED", new Set(["PREVIEW_CUTOVER", "BLOCKED"])],
  ["PREVIEW_CUTOVER", new Set(["PREVIEW_VERIFIED", "BLOCKED", "FAILED_CONFIRMED", "FAILED_UNKNOWN"])],
  ["PREVIEW_VERIFIED", new Set(["PROD_CUTOVER", "BLOCKED"])],
  ["PROD_CUTOVER", new Set(["COMPLETE", "BLOCKED", "FAILED_CONFIRMED", "FAILED_UNKNOWN"])],
  ["BLOCKED", new Set(["PREFLIGHT_PASSED", "SCHEMA_APPLIED", "DATA_APPLIED", "VERIFIED", "PREVIEW_VERIFIED"])],
  ["FAILED_UNKNOWN", new Set(["FAILED_CONFIRMED", "SCHEMA_APPLIED", "DATA_APPLIED", "VERIFIED", "PREVIEW_VERIFIED", "COMPLETE"])],
  ["FAILED_CONFIRMED", new Set()],
  ["COMPLETE", new Set()],
]);
const RECOVERY_TRANSITIONS = new Map([
  ["CREATED", new Set(["PREFLIGHT_PASSED", "BLOCKED", "FAILED_CONFIRMED"])],
  ["PREFLIGHT_PASSED", new Set(["SCHEMA_ADOPTING", "BLOCKED", "FAILED_CONFIRMED"])],
  ["SCHEMA_ADOPTING", new Set(["SCHEMA_APPLIED", "BLOCKED", "FAILED_CONFIRMED", "FAILED_UNKNOWN"])],
  ["SCHEMA_APPLIED", new Set(["DATA_APPLYING", "BLOCKED", "FAILED_CONFIRMED"])],
  ["DATA_APPLYING", new Set(["DATA_APPLIED", "BLOCKED", "FAILED_CONFIRMED", "FAILED_UNKNOWN"])],
  ["DATA_APPLIED", new Set(["VERIFYING", "BLOCKED", "FAILED_CONFIRMED"])],
  ["VERIFYING", new Set(["VERIFIED", "BLOCKED", "FAILED_CONFIRMED", "FAILED_UNKNOWN"])],
  ["VERIFIED", new Set(["PREVIEW_CUTOVER", "BLOCKED"])],
  ["PREVIEW_CUTOVER", new Set(["PREVIEW_VERIFIED", "BLOCKED", "FAILED_CONFIRMED", "FAILED_UNKNOWN"])],
  ["PREVIEW_VERIFIED", new Set(["PROD_CUTOVER", "BLOCKED"])],
  ["PROD_CUTOVER", new Set(["COMPLETE", "BLOCKED", "FAILED_CONFIRMED", "FAILED_UNKNOWN"])],
  ["BLOCKED", new Set(["PREFLIGHT_PASSED", "SCHEMA_APPLIED", "DATA_APPLIED", "VERIFIED", "PREVIEW_VERIFIED"])],
  ["FAILED_UNKNOWN", new Set(["FAILED_CONFIRMED", "SCHEMA_APPLIED", "DATA_APPLIED", "VERIFIED", "PREVIEW_VERIFIED", "COMPLETE"])],
  ["FAILED_CONFIRMED", new Set()],
  ["COMPLETE", new Set()],
]);

function transitionsFor(journal) {
  return journal?.mode === "DATA_RECOVERY" ? RECOVERY_TRANSITIONS : LEGACY_TRANSITIONS;
}

function nowIso() {
  return new Date().toISOString();
}

function assertIdentity({ manifestSha256, sourceCommit, sourceRef, targetRef }) {
  if (!SHA256.test(manifestSha256)) {
    throw new Error("Journal identity requires a SHA-256 manifest hash");
  }
  if (!COMMIT.test(sourceCommit)) {
    throw new Error("Journal identity requires a full source commit");
  }
  assertProjectRole({ projectRef: sourceRef, role: "source", access: "read" });
  assertProjectRole({ projectRef: targetRef, role: "target", access: "read" });
}

function initialJournal(identity, extra = {}) {
  assertIdentity(identity);
  const at = nowIso();
  return {
    contractVersion: extra.contractVersion ?? 1,
    ...extra,
    ...identity,
    state: "CREATED",
    createdAt: at,
    updatedAt: at,
    entries: [{
      from: null,
      to: "CREATED",
      at,
      evidenceSha256: null,
      probeResolution: null,
    }],
  };
}

export function createJournal({
  manifestSha256,
  sourceCommit,
  sourceRef,
  targetRef,
}) {
  return initialJournal({ manifestSha256, sourceCommit, sourceRef, targetRef });
}

export function createRecoveryJournal({
  manifestSha256,
  sourceCommit,
  sourceRef,
  targetRef,
  predecessorManifestSha256,
}) {
  if (!SHA256.test(predecessorManifestSha256 ?? "")) {
    throw new Error("Recovery journal requires a predecessor manifest SHA-256");
  }
  return initialJournal(
    { manifestSha256, sourceCommit, sourceRef, targetRef },
    {
      contractVersion: 2,
      mode: "DATA_RECOVERY",
      predecessorManifestSha256,
    },
  );
}

export function transitionJournal(
  journal,
  { to, evidenceSha256, probeResolution = null },
) {
  validateJournal(journal, {
    manifestSha256: journal.manifestSha256,
    sourceCommit: journal.sourceCommit,
    sourceRef: journal.sourceRef,
    targetRef: journal.targetRef,
    ...(journal.contractVersion === 2
      ? {
          mode: journal.mode,
          predecessorManifestSha256: journal.predecessorManifestSha256,
        }
      : {}),
  });
  if (!SHA256.test(evidenceSha256)) {
    throw new Error("Journal transitions require an evidence SHA-256");
  }
  const allowed = transitionsFor(journal).get(journal.state);
  if (!allowed?.has(to)) {
    throw new Error(`Invalid transition from ${journal.state} to ${to}`);
  }
  if (
    RECOVERY_STATES.has(journal.state) &&
    (typeof probeResolution !== "string" || probeResolution.trim().length === 0)
  ) {
    throw new Error(`A probe resolution is required after ${journal.state}`);
  }
  const at = nowIso();
  return {
    ...structuredClone(journal),
    state: to,
    updatedAt: at,
    entries: [
      ...structuredClone(journal.entries),
      {
        from: journal.state,
        to,
        at,
        evidenceSha256,
        probeResolution,
      },
    ],
  };
}

export function validateJournal(journal, expected) {
  if (![1, 2].includes(journal?.contractVersion) || !Array.isArray(journal.entries)) {
    throw new Error("Invalid journal contract");
  }
  assertIdentity(journal);
  if (
    journal.contractVersion === 2 &&
    (journal.mode !== "DATA_RECOVERY" || !SHA256.test(journal.predecessorManifestSha256 ?? ""))
  ) {
    throw new Error("Invalid recovery journal identity");
  }
  if (journal.contractVersion === 1 && (journal.mode !== undefined || journal.predecessorManifestSha256 !== undefined)) {
    throw new Error("Legacy journal cannot contain recovery identity");
  }
  const identityKeys = ["manifestSha256", "sourceCommit", "sourceRef", "targetRef"];
  if (journal.contractVersion === 2) identityKeys.push("mode", "predecessorManifestSha256");
  for (const key of identityKeys) {
    if (journal[key] !== expected[key]) {
      throw new Error(`Journal identity mismatch for ${key}`);
    }
  }
  if (journal.entries.length === 0 || journal.entries[0].to !== "CREATED") {
    throw new Error("Journal must start at CREATED");
  }
  for (let index = 1; index < journal.entries.length; index += 1) {
    const previous = journal.entries[index - 1];
    const entry = journal.entries[index];
    if (entry.from !== previous.to || !transitionsFor(journal).get(entry.from)?.has(entry.to)) {
      throw new Error(`Invalid journal entry chain at index ${index}`);
    }
    if (!SHA256.test(entry.evidenceSha256)) {
      throw new Error(`Invalid journal evidence at index ${index}`);
    }
    if (
      RECOVERY_STATES.has(entry.from) &&
      (typeof entry.probeResolution !== "string" || entry.probeResolution.trim().length === 0)
    ) {
      throw new Error(`Missing probe resolution at index ${index}`);
    }
  }
  if (journal.state !== journal.entries.at(-1).to) {
    throw new Error("Journal state does not match its last entry");
  }
}

export async function saveJournalAtomically(filePath, journal) {
  validateJournal(journal, {
    manifestSha256: journal.manifestSha256,
    sourceCommit: journal.sourceCommit,
    sourceRef: journal.sourceRef,
    targetRef: journal.targetRef,
    ...(journal.contractVersion === 2
      ? {
          mode: journal.mode,
          predecessorManifestSha256: journal.predecessorManifestSha256,
        }
      : {}),
  });
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(journal, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

export async function loadJournal(filePath, expected) {
  const journal = JSON.parse(await readFile(filePath, "utf8"));
  validateJournal(journal, expected);
  return journal;
}
