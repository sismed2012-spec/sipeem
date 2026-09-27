import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseImportArgs,
  runImport,
  withAggregateBatch,
  withCrosswalkBatch,
  writeImportArtifacts,
} from "./import-inegi-demografia.mjs";

const DEV = "nppvprbfmjbhwheghipa";

test("parseImportArgs defaults to dry-run and requires the DEV project ref", () => {
  assert.deepEqual(
    parseImportArgs(["fixture.zip", "--project-ref", DEV]),
    { zipPath: "fixture.zip", projectRef: DEV, apply: false }
  );
  assert.deepEqual(
    parseImportArgs(["fixture.zip", "--project-ref", DEV, "--apply"]),
    { zipPath: "fixture.zip", projectRef: DEV, apply: true }
  );
  assert.throws(
    () => parseImportArgs(["fixture.zip", "--project-ref", "prod"]),
    /only SIPEEM-DEV is allowed/i
  );
});

test("parseImportArgs also accepts an explicit --zip flag for PowerShell usage", () => {
  assert.deepEqual(
    parseImportArgs(["--zip", "G:\\Mi unidad\\iter.zip", "--project-ref", DEV]),
    { zipPath: "G:\\Mi unidad\\iter.zip", projectRef: DEV, apply: false }
  );
});

test("parseImportArgs accepts one explicit cartography version for crosswalk generation", () => {
  assert.deepEqual(
    parseImportArgs([
      "fixture.zip", "--project-ref", DEV, "--cartografia-version-id", "4025",
    ]),
    {
      zipPath: "fixture.zip",
      projectRef: DEV,
      apply: false,
      cartographyVersionId: 4025,
    }
  );
  assert.throws(
    () => parseImportArgs([
      "fixture.zip", "--project-ref", DEV, "--cartografia-version-id", "0",
    ]),
    /positive integer/i
  );
});

test("withCrosswalkBatch appends a version-scoped stage without mutating canonical batches", () => {
  const prepared = {
    sourceHash: "a".repeat(64),
    profile: {},
    batches: [{ id: "FUENTE:1-1" }],
  };

  const result = withCrosswalkBatch(prepared, 4025);

  assert.equal(prepared.batches.length, 1);
  assert.deepEqual(result.batches.map(({ id }) => id), ["FUENTE:1-1", "CORRESPONDENCIAS:V4025"]);
});

test("withAggregateBatch appends aggregation after the reviewed crosswalk", () => {
  const prepared = withCrosswalkBatch({
    sourceHash: "a".repeat(64),
    profile: {},
    batches: [{ id: "FUENTE:1-1" }],
  }, 4025);

  const result = withAggregateBatch(prepared, 4025);

  assert.deepEqual(result.batches.map(({ id }) => id), [
    "FUENTE:1-1",
    "CORRESPONDENCIAS:V4025",
    "AGREGACION:V4025",
  ]);
});

test("writeImportArtifacts writes deterministic SQL files and a secret-free manifest", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sipeem-demografia-artifacts-"));
  const prepared = {
    sourceHash: "a".repeat(64),
    profile: { totalRows: 5136 },
    batches: [{ id: "source", checksum: "b".repeat(64), fileName: "001-source.sql", sql: "begin;\ncommit;\n" }],
  };

  const manifest = await writeImportArtifacts(prepared, root);
  const sql = await readFile(path.join(root, "001-source.sql"), "utf8");
  const manifestText = await readFile(path.join(root, "manifest.json"), "utf8");

  assert.equal(sql, "begin;\ncommit;\n");
  assert.equal(manifest.batches[0].filePath, path.join(root, "001-source.sql"));
  assert.doesNotMatch(manifestText, /service_role|password|token/i);
});

test("runImport prepares artifacts but does not execute batches in default dry-run", async () => {
  const events = [];
  const result = await runImport(
    { zipPath: "fixture.zip", projectRef: DEV, apply: false },
    {
      preparePackage: async () => ({ sourceHash: "a".repeat(64), profile: {}, batches: [] }),
      writeArtifacts: async (prepared) => { events.push("write"); return { ...prepared, batches: [] }; },
      execute: async () => { events.push("execute"); },
    }
  );

  assert.deepEqual(events, ["write"]);
  assert.equal(result.mode, "dry-run");
});
