import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import { executeCartographyPlan } from "./executor.mjs";

const plan = {
  import: [
    { id: "start", checksum: "a".repeat(64), filePath: "start.sql" },
    { id: "batch-1", checksum: "b".repeat(64), filePath: "batch-1.sql" },
    { id: "batch-2", checksum: "c".repeat(64), filePath: "batch-2.sql" },
  ],
  validate: [{ id: "validate", checksum: "d".repeat(64), filePath: "validate.sql" }],
  publish: [{ id: "publish", checksum: "e".repeat(64), filePath: "publish.sql" }],
};

const checksumByFile = new Map(
  [...plan.import, ...plan.validate, ...plan.publish]
    .map((batch) => [batch.filePath, batch.checksum]),
);

function executionOptions(overrides = {}) {
  return {
    artifactRoot: process.cwd(),
    calculateFileHash: async (filePath) => checksumByFile.get(filePath.split(/[\\/]/).at(-1)),
    ...overrides,
  };
}

describe("safe cartography executor", () => {
  it("defaults to a no-command dry run", async () => {
    let calls = 0;
    const result = await executeCartographyPlan(plan, executionOptions({
      mode: "preflight",
      runCommand: async () => { calls += 1; },
    }));
    assert.equal(calls, 0);
    assert.equal(result.mode, "preflight");
    assert.deepEqual(result.planned, ["start", "batch-1", "batch-2"]);
  });

  it("allows mutations only on SIPEEM-DEV", async () => {
    await assert.rejects(
      () => executeCartographyPlan(plan, executionOptions({ mode: "import", projectRef: "production" })),
      /SIPEEM-DEV/,
    );
  });

  it("skips locally confirmed checksums and records each new success", async () => {
    const calls = [];
    const confirmed = [];
    const result = await executeCartographyPlan(plan, executionOptions({
      mode: "import",
      projectRef: "nppvprbfmjbhwheghipa",
      confirmedChecksums: new Set(["a".repeat(64)]),
      runCommand: async (command, args) => {
        calls.push({ command, args });
        return { exitCode: 0, stdout: "ok", stderr: "" };
      },
      onBatchConfirmed: async (batch) => { confirmed.push(batch.id); },
    }));
    assert.deepEqual(result.skipped, ["start"]);
    assert.deepEqual(result.completed, ["batch-1", "batch-2"]);
    assert.deepEqual(confirmed, ["batch-1", "batch-2"]);
    assert.equal(calls.length, 2);
  });

  it("stops at the first failure and never retries", async () => {
    let calls = 0;
    await assert.rejects(
      () => executeCartographyPlan(plan, executionOptions({
        mode: "import",
        projectRef: "nppvprbfmjbhwheghipa",
        runCommand: async () => {
          calls += 1;
          return calls === 2
            ? { exitCode: 1, stdout: "", stderr: "database unavailable" }
            : { exitCode: 0, stdout: "ok", stderr: "" };
        },
      })),
      /No automatic retry.*database unavailable/,
    );
    assert.equal(calls, 2);
  });

  it("runs validation and publication independently", async () => {
    const calls = [];
    await executeCartographyPlan(plan, executionOptions({
      mode: "validate",
      projectRef: "nppvprbfmjbhwheghipa",
      runCommand: async (_command, args) => {
        calls.push(args.at(-1));
        return { exitCode: 0, stdout: "ok", stderr: "" };
      },
    }));
    assert.equal(calls.length, 1);
    assert.match(calls[0], /validate\.sql$/);
  });

  it("rejects a changed SQL file before opening Supabase", async () => {
    let calls = 0;
    await assert.rejects(
      () => executeCartographyPlan(plan, executionOptions({
        mode: "import",
        projectRef: "nppvprbfmjbhwheghipa",
        calculateFileHash: async () => "f".repeat(64),
        runCommand: async () => {
          calls += 1;
          return { exitCode: 0, stdout: "ok", stderr: "" };
        },
      })),
      /checksum differs from the sealed plan/i,
    );
    assert.equal(calls, 0);
  });

  it("rejects SQL paths outside the selected artifact", async () => {
    const outside = structuredClone(plan);
    outside.import[0].filePath = path.resolve(process.cwd(), "..", "outside.sql");
    await assert.rejects(
      () => executeCartographyPlan(outside, executionOptions({ mode: "preflight" })),
      /outside the selected artifact/i,
    );
  });
});
