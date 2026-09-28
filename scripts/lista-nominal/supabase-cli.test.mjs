import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEV_PROJECT_REF,
  buildSupabaseDbQueryArgs,
  executeListaNominalManifest,
} from "./supabase-cli.mjs";

function manifest() {
  return {
    batches: [
      { id: "CORTE:1-1", checksum: "a".repeat(64), filePath: "001.sql" },
      { id: "SECCIONES:1-2", checksum: "b".repeat(64), filePath: "002.sql" },
      { id: "SECCIONES:3-4", checksum: "c".repeat(64), filePath: "003.sql" },
    ],
  };
}

describe("Supabase one-shot executor", () => {
  it("allows only SIPEEM-DEV and builds the reviewed command shape", () => {
    assert.deepEqual(buildSupabaseDbQueryArgs("batch.sql", DEV_PROJECT_REF), [
      "exec",
      "supabase",
      "--",
      "db",
      "query",
      "--linked",
      "--project-ref",
      DEV_PROJECT_REF,
      "--file",
      "batch.sql",
    ]);
    for (const rejected of ["prod-ref", "", null, undefined]) {
      assert.throws(
        () => buildSupabaseDbQueryArgs("batch.sql", rejected),
        /only SIPEEM-DEV/i,
      );
    }
  });

  it("does not execute anything in dry-run mode", async () => {
    let calls = 0;
    const result = await executeListaNominalManifest(manifest(), {
      apply: false,
      projectRef: DEV_PROJECT_REF,
      runCommand: async () => {
        calls += 1;
        return { exitCode: 0 };
      },
    });
    assert.equal(calls, 0);
    assert.equal(result.mode, "dry-run");
    assert.equal(result.planned.length, 3);
  });

  it("stops after the first failure without retrying", async () => {
    let calls = 0;
    await assert.rejects(
      executeListaNominalManifest(manifest(), {
        apply: true,
        projectRef: DEV_PROJECT_REF,
        runCommand: async () => {
          calls += 1;
          return { exitCode: 1, stdout: "", stderr: "falló" };
        },
      }),
      /No automatic retry/i,
    );
    assert.equal(calls, 1);
  });

  it("resumes after confirmed checksums and persists only successes", async () => {
    const confirmedChecksums = new Set(["a".repeat(64)]);
    const persisted = [];
    const result = await executeListaNominalManifest(manifest(), {
      apply: true,
      projectRef: DEV_PROJECT_REF,
      confirmedChecksums,
      runCommand: async () => ({ exitCode: 0, stdout: "ok", stderr: "" }),
      onBatchConfirmed: async (batch) => persisted.push(batch.checksum),
    });

    assert.deepEqual(result.skipped, ["CORTE:1-1"]);
    assert.deepEqual(result.completed, ["SECCIONES:1-2", "SECCIONES:3-4"]);
    assert.deepEqual(persisted, ["b".repeat(64), "c".repeat(64)]);
  });
});
