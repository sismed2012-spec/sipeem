import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import {
  parseListaNominalImportArgs,
  prepareListaNominalImport,
  runListaNominalImport,
  saveConfirmedChecksumsAtomically,
  writeListaNominalArtifacts,
} from "./import-ine-lista-nominal.mjs";
import { DEV_PROJECT_REF } from "./lista-nominal/supabase-cli.mjs";

const temporaryDirectories = [];

after(async () => {
  for (const directory of temporaryDirectories) {
    assert.ok(directory.startsWith(os.tmpdir()));
    await rm(directory, { recursive: true, force: true });
  }
});

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nominal-import-"));
  temporaryDirectories.push(directory);
  return directory;
}

const prepared = {
  sourceHash: "a".repeat(64),
  cartographyVersionId: 4025,
  profile: { sections: 2 },
  batches: [
    {
      id: "CORTE:1-1",
      stage: "CORTE",
      start: 1,
      end: 1,
      expectedRows: 1,
      checksum: "b".repeat(64),
      fileName: "001-corte.sql",
      sql: "select 1;\n",
    },
  ],
};

describe("nominal-list import CLI", () => {
  it("parses a dry run and rejects any non-DEV project", () => {
    assert.deepEqual(
      parseListaNominalImportArgs([
        "S.xlsx",
        "--project-ref",
        DEV_PROJECT_REF,
        "--cartografia-version-id",
        "4025",
      ]),
      {
        filePath: "S.xlsx",
        projectRef: DEV_PROJECT_REF,
        cartographyVersionId: 4025,
        apply: false,
        publish: false,
      },
    );
    assert.throws(
      () =>
        parseListaNominalImportArgs([
          "S.xlsx",
          "--project-ref",
          "production",
          "--cartografia-version-id",
          "4025",
        ]),
      /only SIPEEM-DEV/i,
    );
  });

  it("treats explicit publish mode as a one-shot applied transition", () => {
    const options = parseListaNominalImportArgs([
      "S.xlsx",
      "--project-ref",
      DEV_PROJECT_REF,
      "--cartografia-version-id",
      "4025",
      "--publish",
    ]);
    assert.equal(options.publish, true);
    assert.equal(options.apply, true);
  });

  it("appends crosswalk to imports and isolates publish to one batch", async () => {
    const common = {
      projectRef: DEV_PROJECT_REF,
      cartographyVersionId: 4025,
    };
    const normal = await prepareListaNominalImport(
      "C:/Users/NZXT/Downloads/S.xlsx",
      { ...common, publish: false },
    );
    assert.equal(normal.batches.at(-1).stage, "CORRESPONDENCIAS");
    assert.equal(
      normal.batches
        .filter((batch) => batch.stage === "SECCIONES")
        .reduce((sum, batch) => sum + batch.expectedRows, 0),
      7191,
    );

    const publication = await prepareListaNominalImport(
      "C:/Users/NZXT/Downloads/S.xlsx",
      { ...common, publish: true },
    );
    assert.deepEqual(
      publication.batches.map((batch) => batch.stage),
      ["PUBLICACION"],
    );
  });

  it("writes SQL and a credential-free manifest", async () => {
    const directory = await temporaryDirectory();
    const manifest = await writeListaNominalArtifacts(prepared, directory);
    assert.equal(await readFile(manifest.batches[0].filePath, "utf8"), "select 1;\n");
    const manifestText = await readFile(path.join(directory, "manifest.json"), "utf8");
    assert.doesNotMatch(manifestText, /service_role|password|postgresql:\/\//i);
    assert.doesNotMatch(manifestText, /select 1/i);
  });

  it("persists confirmed checksums with an atomic rename", async () => {
    const directory = await temporaryDirectory();
    const statePath = path.join(directory, "run-state.json");
    await saveConfirmedChecksumsAtomically(
      statePath,
      new Set(["b".repeat(64), "a".repeat(64)]),
    );
    const state = JSON.parse(await readFile(statePath, "utf8"));
    assert.deepEqual(state.confirmedChecksums, ["a".repeat(64), "b".repeat(64)]);
    await assert.rejects(access(`${statePath}.tmp`));
  });

  it("prepares artifacts but performs no database call by default", async () => {
    const directory = await temporaryDirectory();
    let executions = 0;
    const result = await runListaNominalImport(
      {
        filePath: "S.xlsx",
        projectRef: DEV_PROJECT_REF,
        cartographyVersionId: 4025,
        apply: false,
        publish: false,
      },
      {
        rootDirectory: directory,
        prepareImport: async () => prepared,
        executeManifest: async () => {
          executions += 1;
        },
      },
    );
    assert.equal(result.mode, "dry-run");
    assert.equal(executions, 0);
    assert.equal(result.manifest.batches.length, 1);
  });
});
