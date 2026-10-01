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
  lintDataArtifact,
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
const PRESEEDED = [
  "public.cat_estados_evento",
  "public.cat_estados_georreferenciacion",
  "public.cat_fuentes_evento",
  "public.cat_niveles_sensibilidad",
  "public.cat_tipos_asentamiento",
  "public.cat_tipos_fuerza_electoral",
];

function inventory(extraTables = []) {
  return {
    contractVersion: 1,
    kind: "promotion_data_inventory",
    tables: ["public.fuerzas_electorales", ...STAGING, ...PRESEEDED, ...extraTables].map((name) => ({
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
    contractVersion: 2,
    sourceProjectRef: SOURCE_PROJECT_REF,
    sourceInventorySha256: computeInventoryFingerprint(sourceInventory),
    include: [{ table: "public.fuerzas_electorales", reason: "Canonical data." }],
    exclude: STAGING.map((table) => ({
      table,
      reason: "Transient staging data.",
      documentedIncomingDependencies: [],
    })),
    preseeded: PRESEEDED.map((table, index) => ({
      table,
      reason: "Seeded by a reviewed migration.",
      migration: index === PRESEEDED.length - 1
        ? "20260912045859_fuerzas_electorales.sql"
        : "20260912034515_catalogos.sql",
      orderBy: ["id"],
      ownedSequences: table === "public.cat_niveles_sensibilidad"
        ? []
        : [`${table}_id_seq`],
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

test("builds a closed data-only COPY dump plan with all nine exclusions", async () => {
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
  assert.equal(plan.args.filter((value) => value === "--exclude").length, 9);
  for (const table of [...STAGING, ...PRESEEDED]) assert.ok(plan.args.includes(table));
  assert.deepEqual(plan.include, ["public.fuerzas_electorales"]);
  assert.deepEqual(plan.exclude, [...STAGING].sort());
  assert.deepEqual(plan.preseeded.map(({ table }) => table), [...PRESEEDED].sort());
  assert.ok(plan.args.includes("public.fuerzas_electorales") === false);
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
  const bytes = "COPY public.fuerzas_electorales FROM stdin;\n1\n\\.\n";
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
  assert.match(artifact.lintEvidenceSha256, /^[a-f0-9]{64}$/u);
  assert.equal(artifact.sourceProjectRef, SOURCE_PROJECT_REF);
  assert.doesNotMatch(JSON.stringify(artifact), /password|token|service_role/iu);
  assert.ok(invocation.args.includes(SOURCE_PROJECT_REF));
});

test("rejects quoted or unquoted preseeded COPY, INSERT, and setval before rename", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dump-lint-"));
  const preseeded = dataPolicy(inventory()).preseeded;
  const forbidden = [
    "COPY public.cat_estados_evento FROM stdin;\n",
    'COPY "public"."cat_estados_evento" FROM stdin;\n',
    "INSERT INTO public.cat_estados_evento VALUES (1);\n",
    'INSERT INTO "public"."cat_estados_evento" VALUES (1);\n',
    "SELECT pg_catalog.setval('public.cat_estados_evento_id_seq', 1, true);\n",
    "SELECT pg_catalog.setval('public.\"cat_estados_evento_id_seq\"', 1, true);\n",
  ];
  for (let index = 0; index < forbidden.length; index += 1) {
    const artifactPath = path.join(directory, `forbidden-${index}.sql`);
    await writeFile(artifactPath, forbidden[index], "utf8");
    await assert.rejects(lintDataArtifact({ artifactPath, preseeded }), /preseeded|forbidden/iu);
  }
  const allowedPath = path.join(directory, "allowed.sql");
  await writeFile(allowedPath, "COPY public.fuerzas_electorales FROM stdin;\n", "utf8");
  const lint = await lintDataArtifact({ artifactPath: allowedPath, preseeded });
  assert.equal(lint.status, "PASSED");
  assert.match(lint.evidenceSha256, /^[a-f0-9]{64}$/u);
});

test("does not publish a temporary dump that fails preseeded lint", async () => {
  const sourceInventory = inventory();
  const directory = await mkdtemp(path.join(os.tmpdir(), "dump-lint-before-rename-"));
  const plan = buildDumpPlan({
    inventory: sourceInventory,
    dataPolicy: dataPolicy(sourceInventory),
    artifactPath: path.join(directory, "territorial.sql"),
  });
  await assert.rejects(
    createDataArtifact({
      plan,
      manifest: manifest(),
      dependencies: {
        dockerHealth: async () => ({ available: true, detail: "healthy" }),
        runProcessOnce: async () => {
          await writeFile(plan.temporaryPath, "COPY public.cat_fuentes_evento FROM stdin;\n", "utf8");
          return { exitCode: 0, stdout: "dumped", stderr: "" };
        },
      },
    }),
    /preseeded|forbidden/iu,
  );
  await assert.rejects(readFile(plan.artifactPath, "utf8"), /ENOENT/u);
  assert.match(await readFile(plan.temporaryPath, "utf8"), /cat_fuentes_evento/u);
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
    lintEvidenceSha256: "f".repeat(64),
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
  assert.equal(invocation.command, "docker");
  assert.deepEqual(invocation.args, [
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
    `type=bind,source=${artifactPath},target=/transfer/territorial-data.sql,readonly`,
    "public.ecr.aws/supabase/postgres:17.11.0.002",
    "psql",
    "--single-transaction",
    "--set",
    "ON_ERROR_STOP=on",
    "--set",
    "VERBOSITY=verbose",
    "--file",
    "/transfer/territorial-data.sql",
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
    lintEvidenceSha256: "f".repeat(64),
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
