import assert from "node:assert/strict";
import test from "node:test";

import {
  DEV_PROJECT_REF,
  buildNpmExecInvocation,
  buildSupabaseDbQueryArgs,
  executeManifest,
} from "./supabase-cli.mjs";

const manifest = {
  batches: [
    { id: "b1", checksum: "a".repeat(64), filePath: "C:\\tmp\\b1.sql" },
    { id: "b2", checksum: "b".repeat(64), filePath: "C:\\tmp\\b2.sql" },
  ],
};

test("buildSupabaseDbQueryArgs pins the exact DEV project and SQL file", () => {
  assert.deepEqual(buildSupabaseDbQueryArgs("C:\\tmp\\b1.sql", DEV_PROJECT_REF), [
    "exec",
    "supabase",
    "--",
    "db",
    "query",
    "--linked",
    "--project-ref",
    DEV_PROJECT_REF,
    "--file",
    "C:\\tmp\\b1.sql",
  ]);
  assert.throws(
    () => buildSupabaseDbQueryArgs("C:\\tmp\\b1.sql", "production-ref"),
    /only SIPEEM-DEV is allowed/i
  );
});

test("buildNpmExecInvocation bypasses cmd shims on Windows", () => {
  assert.deepEqual(
    buildNpmExecInvocation(["exec", "supabase"], {
      platform: "win32",
      execPath: "C:\\Program Files\\nodejs\\node.exe",
      npmExecPath: "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
    }),
    {
      command: "C:\\Program Files\\nodejs\\node.exe",
      args: [
        "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
        "exec",
        "supabase",
      ],
    }
  );
});

test("executeManifest dry-run never starts an external process", async () => {
  let calls = 0;
  const result = await executeManifest(manifest, {
    apply: false,
    projectRef: DEV_PROJECT_REF,
    runCommand: async () => { calls += 1; return { exitCode: 0, stdout: "", stderr: "" }; },
  });

  assert.equal(calls, 0);
  assert.deepEqual(result.planned, ["b1", "b2"]);
});

test("executeManifest submits every batch and lets the remote ledger decide idempotence", async () => {
  const calls = [];
  const confirmed = [];
  const result = await executeManifest(manifest, {
    apply: true,
    projectRef: DEV_PROJECT_REF,
    confirmedChecksums: new Set(["a".repeat(64)]),
    runCommand: async (command, args) => {
      calls.push({ command, args });
      return { exitCode: 0, stdout: "ok", stderr: "" };
    },
    onBatchConfirmed: async (batch) => confirmed.push(batch.checksum),
  });

  assert.equal(calls.length, 2);
  assert.notEqual(calls[0].command.toLowerCase(), "npm.cmd");
  assert.match(calls[0].args.at(-1), /b1\.sql$/);
  assert.match(calls[1].args.at(-1), /b2\.sql$/);
  assert.deepEqual(confirmed, ["a".repeat(64), "b".repeat(64)]);
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(result.completed, ["b1", "b2"]);
});

test("executeManifest stops on the first failure and never retries automatically", async () => {
  const calls = [];
  await assert.rejects(
    () => executeManifest(manifest, {
      apply: true,
      projectRef: DEV_PROJECT_REF,
      runCommand: async (_command, args) => {
        calls.push(args.at(-1));
        return { exitCode: 1, stdout: "", stderr: "batch failed" };
      },
    }),
    /batch b1 failed.*resume checksum/i
  );

  assert.deepEqual(calls, ["C:\\tmp\\b1.sql"]);
});
