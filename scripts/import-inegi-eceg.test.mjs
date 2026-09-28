import assert from "node:assert/strict";
import test from "node:test";

import {
  parseEcegImportArgs,
  runEcegImport,
} from "./import-inegi-eceg.mjs";

const DEV = "nppvprbfmjbhwheghipa";

test("parseEcegImportArgs defaults to dry-run and pins DEV plus one version", () => {
  assert.deepEqual(
    parseEcegImportArgs([
      "--xlsx",
      "G:\\Mi unidad\\ECEG.xlsx",
      "--project-ref",
      DEV,
      "--cartografia-version-id",
      "4025",
    ]),
    {
      xlsxPath: "G:\\Mi unidad\\ECEG.xlsx",
      projectRef: DEV,
      cartographyVersionId: 4025,
      apply: false,
    }
  );
  assert.deepEqual(
    parseEcegImportArgs([
      "fixture.xlsx", "--project-ref", DEV,
      "--cartografia-version-id", "4025", "--apply",
    ]).apply,
    true
  );
});

test("parseEcegImportArgs rejects non-DEV, missing version and unknown flags", () => {
  assert.throws(
    () => parseEcegImportArgs([
      "fixture.xlsx", "--project-ref", "prod",
      "--cartografia-version-id", "4025",
    ]),
    /only SIPEEM-DEV is allowed/i
  );
  assert.throws(
    () => parseEcegImportArgs(["fixture.xlsx", "--project-ref", DEV]),
    /cartografia-version-id is required/i
  );
  assert.throws(
    () => parseEcegImportArgs([
      "fixture.xlsx", "--project-ref", DEV,
      "--cartografia-version-id", "4025", "--retry",
    ]),
    /unknown argument: --retry/i
  );
});

test("runEcegImport writes artifacts but never executes in default dry-run", async () => {
  const events = [];
  const result = await runEcegImport(
    {
      xlsxPath: "fixture.xlsx",
      projectRef: DEV,
      cartographyVersionId: 4025,
      apply: false,
    },
    {
      preparePackage: async () => ({
        sourceHash: "a".repeat(64),
        profile: { sectionCount: 6544 },
        batches: [{ id: "FUENTE:1-1" }],
      }),
      writeArtifacts: async (prepared) => {
        events.push("write");
        return { ...prepared, batches: [] };
      },
      execute: async () => { events.push("execute"); },
    }
  );

  assert.deepEqual(events, ["write"]);
  assert.equal(result.mode, "dry-run");
});

test("runEcegImport delegates apply once and persists confirmations via callback", async () => {
  const events = [];
  const result = await runEcegImport(
    {
      xlsxPath: "fixture.xlsx",
      projectRef: DEV,
      cartographyVersionId: 4025,
      apply: true,
    },
    {
      rootDirectory: "ignored-in-test",
      preparePackage: async () => ({
        sourceHash: "a".repeat(64),
        profile: {},
        batches: [],
      }),
      writeArtifacts: async () => ({ batches: [] }),
      loadState: async () => new Set(),
      saveState: async () => { events.push("save"); },
      execute: async (_manifest, options) => {
        events.push("execute");
        await options.onBatchConfirmed({ checksum: "b".repeat(64) });
        return { mode: "apply", completed: ["FUENTE:1-1"] };
      },
    }
  );

  assert.deepEqual(events, ["execute", "save"]);
  assert.deepEqual(result.execution.completed, ["FUENTE:1-1"]);
});
