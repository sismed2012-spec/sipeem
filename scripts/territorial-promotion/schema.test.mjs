import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createJournal, transitionJournal } from "./journal.mjs";
import { SOURCE_PROJECT_REF, TARGET_PROJECT_REF } from "./policy.mjs";
import {
  applySchemaPromotionOnce,
  planSchemaPromotion,
  probeSchemaState,
} from "./schema.mjs";

const MANIFEST_SHA = "a".repeat(64);
const SOURCE_COMMIT = "b".repeat(40);
const EVIDENCE_SHA = "c".repeat(64);

function migrationName(index) {
  return `202609${String(index + 1).padStart(8, "0")}_migration_${String(index + 1).padStart(2, "0")}.sql`;
}

function manifest() {
  return {
    manifestSha256: MANIFEST_SHA,
    sourceCommit: SOURCE_COMMIT,
    source: { projectRef: SOURCE_PROJECT_REF },
    target: { projectRef: TARGET_PROJECT_REF },
    migrations: Array.from({ length: 49 }, (_, index) => ({
      path: `infra/territorial/supabase/migrations/${migrationName(index)}`,
      sha256: index.toString(16).padStart(64, "0"),
    })),
  };
}

function preflightJournal() {
  const created = createJournal({
    manifestSha256: MANIFEST_SHA,
    sourceCommit: SOURCE_COMMIT,
    sourceRef: SOURCE_PROJECT_REF,
    targetRef: TARGET_PROJECT_REF,
  });
  return transitionJournal(created, {
    to: "PREFLIGHT_PASSED",
    evidenceSha256: EVIDENCE_SHA,
  });
}

function dryRunOutput(names) {
  return `Dry run complete.\nWould push these migrations:\n${names.map((name) => ` - ${name}`).join("\n")}\n`;
}

test("plans exactly 49 ordered migrations with the territorial dry-run", async () => {
  const input = manifest();
  const before = structuredClone(input);
  let invocation;
  const plan = await planSchemaPromotion({
    manifest: input,
    projectRef: TARGET_PROJECT_REF,
    dependencies: {
      runProcessOnce: async (value) => {
        invocation = value;
        return {
          exitCode: 0,
          stdout: dryRunOutput(input.migrations.map(({ path }) => path.split("/").at(-1))),
          stderr: "password=hunter2",
        };
      },
    },
  });

  assert.equal(plan.matchesManifest, true);
  assert.deepEqual(plan.migrations, input.migrations.map(({ path }) => path.split("/").at(-1)));
  assert.match(plan.evidenceSha256, /^[a-f0-9]{64}$/u);
  assert.doesNotMatch(plan.output, /hunter2/iu);
  assert.deepEqual(input, before);
  assert.deepEqual(
    invocation.args.slice(-8),
    [
      "--workdir",
      "infra/territorial",
      "db",
      "push",
      "--dry-run",
      "--skip-vault",
      "--project-ref",
      TARGET_PROJECT_REF,
    ],
  );
  assert.equal(invocation.shell, undefined);
});

test("blocks incomplete, extra, reordered, or failed dry-run output", async () => {
  const input = manifest();
  const names = input.migrations.map(({ path }) => path.split("/").at(-1));
  for (const [candidate, exitCode] of [
    [names.slice(0, -1), 0],
    [[...names, "20261001000000_extra.sql"], 0],
    [[names[1], names[0], ...names.slice(2)], 0],
    [names, 1],
  ]) {
    const plan = await planSchemaPromotion({
      manifest: input,
      projectRef: TARGET_PROJECT_REF,
      dependencies: {
        runProcessOnce: async () => ({
          exitCode,
          stdout: dryRunOutput(candidate),
          stderr: exitCode === 0 ? "" : "remote error",
        }),
      },
    });
    assert.equal(plan.matchesManifest, false);
  }
});

test("persists SCHEMA_APPLYING before one push and requires a complete postflight", async () => {
  const input = manifest();
  const persisted = [];
  let pushes = 0;
  const result = await applySchemaPromotionOnce({
    manifest: input,
    journal: preflightJournal(),
    confirmation: `${MANIFEST_SHA}:SCHEMA_APPLY`,
    dependencies: {
      planSchemaPromotion: async () => ({
        matchesManifest: true,
        migrations: input.migrations.map(({ path }) => path.split("/").at(-1)),
        output: "reviewed",
        evidenceSha256: "d".repeat(64),
      }),
      persistJournal: async (journal) => persisted.push(structuredClone(journal)),
      runProcessOnce: async () => {
        pushes += 1;
        assert.equal(persisted.at(-1).state, "SCHEMA_APPLYING");
        return { exitCode: 0, stdout: "Applied", stderr: "" };
      },
      probeSchemaState: async () => ({
        status: "COMPLETE",
        evidenceSha256: "e".repeat(64),
      }),
    },
  });

  assert.equal(pushes, 1);
  assert.deepEqual(persisted.map(({ state }) => state), ["SCHEMA_APPLYING", "SCHEMA_APPLIED"]);
  assert.equal(result.state, "SCHEMA_APPLIED");
});

test("classifies a known failure and process loss without retrying", async () => {
  const input = manifest();
  for (const [processResult, expectedState] of [
    [{ exitCode: 1, stdout: "", stderr: "migration rejected" }, "FAILED_CONFIRMED"],
    [{ exitCode: null, stdout: "", stderr: "connection lost", errorCode: "ECONNRESET" }, "FAILED_UNKNOWN"],
  ]) {
    let pushes = 0;
    const result = await applySchemaPromotionOnce({
      manifest: input,
      journal: preflightJournal(),
      confirmation: `${MANIFEST_SHA}:SCHEMA_APPLY`,
      dependencies: {
        planSchemaPromotion: async () => ({
          matchesManifest: true,
          migrations: input.migrations.map(({ path }) => path.split("/").at(-1)),
          output: "reviewed",
          evidenceSha256: "d".repeat(64),
        }),
        persistJournal: async () => {},
        runProcessOnce: async () => {
          pushes += 1;
          return processResult;
        },
        probeSchemaState: async () => {
          throw new Error("postflight must not run after a failed push");
        },
      },
    });
    assert.equal(pushes, 1);
    assert.equal(result.state, expectedState);
  }
});

test("never replays db push while applying or failure remains unresolved", async () => {
  const input = manifest();
  let applying = transitionJournal(preflightJournal(), {
    to: "SCHEMA_APPLYING",
    evidenceSha256: "d".repeat(64),
  });
  let pushes = 0;
  const completed = await applySchemaPromotionOnce({
    manifest: input,
    journal: applying,
    confirmation: `${MANIFEST_SHA}:SCHEMA_APPLY`,
    dependencies: {
      persistJournal: async () => {},
      runProcessOnce: async () => {
        pushes += 1;
      },
      probeSchemaState: async () => ({ status: "COMPLETE", evidenceSha256: "e".repeat(64) }),
    },
  });
  assert.equal(completed.state, "SCHEMA_APPLIED");

  applying = transitionJournal(applying, {
    to: "FAILED_UNKNOWN",
    evidenceSha256: "f".repeat(64),
  });
  const unresolved = await applySchemaPromotionOnce({
    manifest: input,
    journal: applying,
    confirmation: `${MANIFEST_SHA}:SCHEMA_APPLY`,
    dependencies: {
      persistJournal: async () => {},
      runProcessOnce: async () => {
        pushes += 1;
      },
      probeSchemaState: async () => ({ status: "PARTIAL", evidenceSha256: "1".repeat(64) }),
    },
  });
  assert.equal(unresolved.state, "FAILED_UNKNOWN");
  assert.equal(pushes, 0);
});

test("rejects an unrelated confirmation or mismatched plan before spawning", async () => {
  const input = manifest();
  let pushes = 0;
  for (const [confirmation, matchesManifest] of [
    ["wrong:SCHEMA_APPLY", true],
    [`${MANIFEST_SHA}:SCHEMA_APPLY`, false],
  ]) {
    await assert.rejects(
      applySchemaPromotionOnce({
        manifest: input,
        journal: preflightJournal(),
        confirmation,
        dependencies: {
          planSchemaPromotion: async () => ({ matchesManifest, evidenceSha256: "d".repeat(64) }),
          persistJournal: async () => {},
          runProcessOnce: async () => {
            pushes += 1;
          },
        },
      }),
      /confirmation|plan/iu,
    );
  }
  await assert.rejects(
    applySchemaPromotionOnce({
      manifest: input,
      journal: preflightJournal(),
      confirmation: `${MANIFEST_SHA}:SCHEMA_APPLY`,
      dependencies: {
        planSchemaPromotion: async () => ({
          matchesManifest: true,
          migrations: [],
          evidenceSha256: "d".repeat(64),
        }),
        persistJournal: async () => {},
        runProcessOnce: async () => {
          pushes += 1;
        },
      },
    }),
    /plan/iu,
  );
  assert.equal(pushes, 0);
});

test("probes exact history, hashes, extensions, security and operational isolation", async () => {
  const input = manifest();
  const versions = input.migrations.map(({ path }) => path.split("/").at(-1).slice(0, 14));
  const healthy = {
    contractVersion: 1,
    kind: "promotion_schema_postflight",
    migrationVersions: versions,
    extensions: ["btree_gist", "pgcrypto", "postgis", "vector"],
    missingRequiredObjects: [],
    territorialObjectCount: 70,
    rlsViolations: [],
    privilegeViolations: [],
    functionViolations: [],
    operationalObjects: [],
  };
  const dependencies = {
    validateLocalHashes: async () => ({ valid: true, mismatches: [] }),
    queryProject: async () => ({ exitCode: 0, stdout: JSON.stringify(healthy), stderr: "" }),
  };

  const complete = await probeSchemaState({
    projectRef: TARGET_PROJECT_REF,
    manifest: input,
    dependencies,
  });
  assert.equal(complete.status, "COMPLETE");
  assert.match(complete.evidenceSha256, /^[a-f0-9]{64}$/u);

  const partial = await probeSchemaState({
    projectRef: TARGET_PROJECT_REF,
    manifest: input,
    dependencies: {
      ...dependencies,
      queryProject: async () => ({
        exitCode: 0,
        stdout: JSON.stringify({ ...healthy, migrationVersions: [...versions, "99999999999999"] }),
        stderr: "",
      }),
    },
  });
  assert.equal(partial.status, "PARTIAL");
});

test("probes the single-row wrapper returned by Supabase db query", async () => {
  const input = manifest();
  const versions = input.migrations.map(({ path }) => path.split("/").at(-1).slice(0, 14));
  const healthy = {
    contractVersion: 1,
    kind: "promotion_schema_postflight",
    migrationVersions: versions,
    extensions: ["btree_gist", "pgcrypto", "postgis", "vector"],
    missingRequiredObjects: [],
    territorialObjectCount: 70,
    rlsViolations: [],
    privilegeViolations: [],
    functionViolations: [],
    operationalObjects: [],
  };
  const result = await probeSchemaState({
    projectRef: TARGET_PROJECT_REF,
    manifest: input,
    dependencies: {
      validateLocalHashes: async () => ({ valid: true, mismatches: [] }),
      queryProject: async () => ({
        exitCode: 0,
        stdout: JSON.stringify({ rows: [{ jsonb_build_object: healthy }] }),
        stderr: "",
      }),
    },
  });
  assert.equal(result.status, "COMPLETE");
});

test("ships a single read-only schema postflight with every invariant", async () => {
  const sql = await readFile(
    "infra/territorial/supabase/tests/promotion_schema_postflight.sql",
    "utf8",
  );
  assert.match(sql, /^\s*(?:with\b|select\b)/iu);
  assert.doesNotMatch(
    sql.replace(/--.*$/gmu, ""),
    /\b(?:insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|call|do|copy)\b/iu,
  );
  assert.equal((sql.match(/;\s*(?=\s*$)/gu) ?? []).length, 1);
  for (const signal of [
    "schema_migrations",
    "relrowsecurity",
    "privilege",
    "prosecdef",
    "operational",
    "territorial",
  ]) {
    assert.match(sql.toLowerCase(), new RegExp(signal, "u"));
  }
});
