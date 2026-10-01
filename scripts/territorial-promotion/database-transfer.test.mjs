import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createJournal, transitionJournal } from "./journal.mjs";
import { SOURCE_PROJECT_REF, TARGET_PROJECT_REF } from "./policy.mjs";
import {
  buildDumpPlan,
  createDataArtifact,
  restoreDataArtifactOnce,
} from "./database-transfer.mjs";
import { computeInventoryFingerprint } from "./data-policy.mjs";

const MANIFEST_SHA = "a".repeat(64);
const SOURCE_COMMIT = "b".repeat(40);
const EVIDENCE_SHA = "c".repeat(64);
const STAGING = [
  "public.staging_electoral_incidencias",
  "public.staging_electoral_registros",
  "public.staging_electoral_resultados",
];

function inventory(extraTables = []) {
  return {
    contractVersion: 1,
    kind: "promotion_data_inventory",
    tables: ["public.canonical", ...STAGING, ...extraTables].map((name) => ({
      name,
      primaryKey: ["id"],
      estimatedRows: 1,
      totalBytes: 1,
    })),
    foreignKeys: [],
    sequences: [],
    dependencies: [],
  };
}

function dataPolicy(sourceInventory) {
  return {
    contractVersion: 1,
    sourceProjectRef: SOURCE_PROJECT_REF,
    sourceInventorySha256: computeInventoryFingerprint(sourceInventory),
    include: [{ table: "public.canonical", reason: "Canonical data." }],
    exclude: STAGING.map((table) => ({
      table,
      reason: "Transient staging data.",
      documentedIncomingDependencies: [],
    })),
  };
}

function manifest() {
  return {
    manifestSha256: MANIFEST_SHA,
    sourceCommit: SOURCE_COMMIT,
    source: { projectRef: SOURCE_PROJECT_REF },
    target: { projectRef: TARGET_PROJECT_REF },
  };
}

function schemaAppliedJournal() {
  let journal = createJournal({
    manifestSha256: MANIFEST_SHA,
    sourceCommit: SOURCE_COMMIT,
    sourceRef: SOURCE_PROJECT_REF,
    targetRef: TARGET_PROJECT_REF,
  });
  for (const to of ["PREFLIGHT_PASSED", "SCHEMA_APPLYING", "SCHEMA_APPLIED"]) {
    journal = transitionJournal(journal, { to, evidenceSha256: EVIDENCE_SHA });
  }
  return journal;
}

test("builds a closed data-only COPY dump plan with one exclusion per table", async () => {
  const sourceInventory = inventory();
  const artifactPath = path.join(await mkdtemp(path.join(os.tmpdir(), "dump-plan-")), "data.sql");
  const plan = buildDumpPlan({
    inventory: sourceInventory,
    dataPolicy: dataPolicy(sourceInventory),
    artifactPath,
  });

  assert.deepEqual(plan.args.slice(0, 6), [
    "db",
    "dump",
    "--data-only",
    "--use-copy",
    "--schema",
    "public",
  ]);
  assert.equal(plan.args.filter((value) => value === "--exclude").length, 3);
  for (const table of STAGING) assert.ok(plan.args.includes(table));
  assert.deepEqual(plan.include, ["public.canonical"]);
  assert.deepEqual(plan.exclude, [...STAGING].sort());
  assert.equal(plan.temporaryPath, `${artifactPath}.tmp`);
  assert.equal(plan.inventorySha256, computeInventoryFingerprint(sourceInventory));
  assert.match(plan.planSha256, /^[a-f0-9]{64}$/u);
});

test("blocks dump planning when a new source table is not classified", async () => {
  const reviewed = inventory();
  const changed = inventory(["public.new_table"]);
  const artifactPath = path.join(await mkdtemp(path.join(os.tmpdir(), "dump-drift-")), "data.sql");
  assert.throws(
    () =>
      buildDumpPlan({
        inventory: changed,
        dataPolicy: dataPolicy(reviewed),
        artifactPath,
      }),
    /fingerprint|missing/iu,
  );
});

test("blocks before spawning without Docker and creates an atomic hashed artifact", async () => {
  const sourceInventory = inventory();
  const directory = await mkdtemp(path.join(os.tmpdir(), "dump-artifact-"));
  const plan = buildDumpPlan({
    inventory: sourceInventory,
    dataPolicy: dataPolicy(sourceInventory),
    artifactPath: path.join(directory, "territorial.sql"),
  });
  let spawns = 0;
  await assert.rejects(
    createDataArtifact({
      plan,
      manifest: manifest(),
      dependencies: {
        dockerHealth: async () => ({ available: false, detail: "daemon unavailable" }),
        runProcessOnce: async () => {
          spawns += 1;
        },
      },
    }),
    /docker.*blocked/iu,
  );
  assert.equal(spawns, 0);

  await assert.rejects(
    createDataArtifact({
      plan: { ...plan, args: plan.args.filter((value) => value !== "--use-copy") },
      manifest: manifest(),
      dependencies: {
        dockerHealth: async () => ({ available: true, detail: "healthy" }),
        runProcessOnce: async () => {
          spawns += 1;
        },
      },
    }),
    /plan.*integrity/iu,
  );
  assert.equal(spawns, 0);

  let invocation;
  const bytes = "COPY public.canonical FROM stdin;\n1\n\\.\n";
  const artifact = await createDataArtifact({
    plan,
    manifest: manifest(),
    dependencies: {
      dockerHealth: async () => ({ available: true, detail: "healthy" }),
      runProcessOnce: async (value) => {
        spawns += 1;
        invocation = value;
        await writeFile(plan.temporaryPath, bytes, "utf8");
        return { exitCode: 0, stdout: "dumped", stderr: "" };
      },
    },
  });

  assert.equal(spawns, 1);
  assert.equal(await readFile(plan.artifactPath, "utf8"), bytes);
  assert.equal(artifact.sizeBytes, Buffer.byteLength(bytes));
  assert.equal(artifact.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(artifact.sourceProjectRef, SOURCE_PROJECT_REF);
  assert.doesNotMatch(JSON.stringify(artifact), /password|token|service_role/iu);
  assert.ok(invocation.args.includes(SOURCE_PROJECT_REF));
});

test("restores once with credentials only in the child environment", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "restore-data-"));
  const artifactPath = path.join(directory, "territorial.sql");
  const bytes = "COPY public.canonical FROM stdin;\n1\n\\.\n";
  await writeFile(artifactPath, bytes, "utf8");
  const artifact = {
    contractVersion: 1,
    path: artifactPath,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: Buffer.byteLength(bytes),
    manifestSha256: MANIFEST_SHA,
    sourceProjectRef: SOURCE_PROJECT_REF,
  };
  const persisted = [];
  let invocation;
  const result = await restoreDataArtifactOnce({
    artifact,
    manifest: manifest(),
    journal: schemaAppliedJournal(),
    confirmation: `${MANIFEST_SHA}:DATA_APPLY`,
    dependencies: {
      persistJournal: async (journal) => persisted.push(structuredClone(journal)),
      getTargetConnection: async () => ({
        projectRef: TARGET_PROJECT_REF,
        env: {
          PGHOST: "db.example.invalid",
          PGUSER: "postgres",
          PGDATABASE: "postgres",
          PGPASSWORD: "top-secret",
        },
      }),
      runProcessOnce: async (value) => {
        invocation = value;
        assert.equal(persisted.at(-1).state, "DATA_APPLYING");
        return { exitCode: 0, stdout: "restored", stderr: "" };
      },
    },
  });

  assert.equal(result.state, "DATA_APPLIED");
  assert.deepEqual(persisted.map(({ state }) => state), ["DATA_APPLYING", "DATA_APPLIED"]);
  assert.deepEqual(invocation.args, [
    "--single-transaction",
    "--set",
    "ON_ERROR_STOP=on",
    "--file",
    artifactPath,
  ]);
  assert.equal(invocation.env.PGPASSWORD, "top-secret");
  assert.doesNotMatch(invocation.args.join(" "), /top-secret|postgresql:\/\//iu);
  assert.equal(invocation.stdin, undefined);
});

test("classifies restore failure and never replays an unresolved data apply", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "restore-resume-"));
  const artifactPath = path.join(directory, "territorial.sql");
  const bytes = "select 1;\n";
  await writeFile(artifactPath, bytes, "utf8");
  const artifact = {
    contractVersion: 1,
    path: artifactPath,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: Buffer.byteLength(bytes),
    manifestSha256: MANIFEST_SHA,
    sourceProjectRef: SOURCE_PROJECT_REF,
  };
  let calls = 0;
  let journal = await restoreDataArtifactOnce({
    artifact,
    manifest: manifest(),
    journal: schemaAppliedJournal(),
    confirmation: `${MANIFEST_SHA}:DATA_APPLY`,
    dependencies: {
      persistJournal: async () => {},
      getTargetConnection: async () => ({ projectRef: TARGET_PROJECT_REF, env: { PGPASSWORD: "secret" } }),
      runProcessOnce: async () => {
        calls += 1;
        return { exitCode: null, stdout: "", stderr: "connection lost", errorCode: "ECONNRESET" };
      },
    },
  });
  assert.equal(journal.state, "FAILED_UNKNOWN");

  journal = await restoreDataArtifactOnce({
    artifact,
    manifest: manifest(),
    journal,
    confirmation: `${MANIFEST_SHA}:DATA_APPLY`,
    dependencies: {
      persistJournal: async () => {},
      probeDataState: async () => ({ status: "PARTIAL", evidenceSha256: "d".repeat(64) }),
      runProcessOnce: async () => {
        calls += 1;
      },
    },
  });
  assert.equal(journal.state, "FAILED_UNKNOWN");
  assert.equal(calls, 1);
});
