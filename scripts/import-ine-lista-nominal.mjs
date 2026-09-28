import { readFile, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readListaNominalWorkbook } from "./lista-nominal/ine-parser.mjs";
import {
  assertExpectedListaNominalProfile,
  buildListaNominalProfile,
} from "./lista-nominal/profile.mjs";
import {
  buildCutBatch,
  buildPublishBatch,
  buildSectionBatches,
} from "./lista-nominal/sql-batches.mjs";
import { buildListaNominalCrosswalkBatch } from "./lista-nominal/crosswalk.mjs";
import {
  DEV_PROJECT_REF,
  assertDevProjectRef,
  executeListaNominalManifest,
} from "./lista-nominal/supabase-cli.mjs";

export function parseListaNominalImportArgs(argv) {
  let filePath = null;
  let projectRef = null;
  let cartographyVersionId = null;
  let apply = false;
  let publish = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--project-ref") {
      projectRef = argv[index + 1] ?? null;
      index += 1;
    } else if (argument === "--cartografia-version-id") {
      cartographyVersionId = Number(argv[index + 1]);
      index += 1;
    } else if (argument === "--apply") {
      apply = true;
    } else if (argument === "--publish") {
      publish = true;
    } else if (!argument.startsWith("--") && filePath === null) {
      filePath = argument;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!filePath) throw new Error("An INE nominal-list XLSX path is required");
  assertDevProjectRef(projectRef);
  if (!Number.isSafeInteger(cartographyVersionId) || cartographyVersionId <= 0) {
    throw new Error("cartografia-version-id must be a positive integer");
  }
  return {
    filePath,
    projectRef,
    cartographyVersionId,
    apply: apply || publish,
    publish,
  };
}

export async function prepareListaNominalImport(filePath, options) {
  assertDevProjectRef(options.projectRef);
  if (
    !Number.isSafeInteger(options.cartographyVersionId) ||
    options.cartographyVersionId <= 0
  ) {
    throw new Error("cartografia-version-id must be a positive integer");
  }

  const archive = await readListaNominalWorkbook(filePath);
  const profile = assertExpectedListaNominalProfile(
    buildListaNominalProfile(archive),
  );
  if (options.publish) {
    return {
      sourceHash: archive.sourceHash,
      cartographyVersionId: options.cartographyVersionId,
      profile,
      batches: [
        buildPublishBatch({
          sourceHash: archive.sourceHash,
          cartographyVersionId: options.cartographyVersionId,
        }),
      ],
    };
  }

  const batches = [
    buildCutBatch({
      sourceHash: archive.sourceHash,
      fileName: path.basename(filePath),
      cutoffDate: archive.cutoffDate,
      profile,
      foreignResidents: archive.foreignResidents,
      sheetName: archive.sheetName,
    }),
    ...buildSectionBatches(archive.sections, {
      sourceHash: archive.sourceHash,
      batchSize: options.batchSize,
    }),
    buildListaNominalCrosswalkBatch({
      sourceHash: archive.sourceHash,
      cartographyVersionId: options.cartographyVersionId,
      expectedRows: profile.sections,
    }),
  ];
  return {
    sourceHash: archive.sourceHash,
    cartographyVersionId: options.cartographyVersionId,
    profile,
    batches,
  };
}

export async function writeListaNominalArtifacts(prepared, outputDirectory) {
  await mkdir(outputDirectory, { recursive: true });
  const batches = [];
  for (const batch of prepared.batches) {
    const filePath = path.resolve(outputDirectory, batch.fileName);
    await writeFile(filePath, batch.sql, "utf8");
    batches.push({
      id: batch.id,
      stage: batch.stage,
      start: batch.start,
      end: batch.end,
      expectedRows: batch.expectedRows,
      checksum: batch.checksum,
      fileName: batch.fileName,
      filePath,
    });
  }
  const manifest = {
    sourceHash: prepared.sourceHash,
    cartographyVersionId: prepared.cartographyVersionId,
    profile: prepared.profile,
    batches,
  };
  await writeFile(
    path.join(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}

export async function loadConfirmedChecksums(statePath) {
  try {
    const state = JSON.parse(await readFile(statePath, "utf8"));
    return new Set(state.confirmedChecksums ?? []);
  } catch (error) {
    if (error?.code === "ENOENT") return new Set();
    throw error;
  }
}

export async function saveConfirmedChecksumsAtomically(statePath, checksums) {
  const temporaryPath = `${statePath}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify({ confirmedChecksums: [...checksums].sort() }, null, 2)}\n`,
    "utf8",
  );
  await rename(temporaryPath, statePath);
}

export async function runListaNominalImport(options, dependencies = {}) {
  assertDevProjectRef(options.projectRef);
  const prepareImport =
    dependencies.prepareImport ?? prepareListaNominalImport;
  const writeArtifacts =
    dependencies.writeArtifacts ?? writeListaNominalArtifacts;
  const executeManifest =
    dependencies.executeManifest ?? executeListaNominalManifest;
  const prepared = await prepareImport(options.filePath, options);
  const rootDirectory =
    dependencies.rootDirectory ??
    path.resolve(
      ".artifacts",
      "lista-nominal",
      `${prepared.sourceHash}-v${options.cartographyVersionId}`,
    );
  const manifest = await writeArtifacts(prepared, rootDirectory);
  if (!options.apply) return { mode: "dry-run", rootDirectory, manifest };

  const statePath = path.join(rootDirectory, "run-state.json");
  const confirmedChecksums = await loadConfirmedChecksums(statePath);
  const execution = await executeManifest(manifest, {
    apply: true,
    projectRef: options.projectRef,
    confirmedChecksums,
    onBatchConfirmed: async (batch) => {
      confirmedChecksums.add(batch.checksum);
      await saveConfirmedChecksumsAtomically(statePath, confirmedChecksums);
    },
  });
  return { mode: "apply", rootDirectory, manifest, execution };
}

async function main() {
  const options = parseListaNominalImportArgs(process.argv.slice(2));
  const result = await runListaNominalImport(options);
  const plannedRows = result.manifest.batches
    .filter((batch) => batch.stage === "SECCIONES")
    .reduce((sum, batch) => sum + batch.expectedRows, 0);
  process.stdout.write(
    `${JSON.stringify(
      {
        mode: result.mode,
        projectRef: DEV_PROJECT_REF,
        rootDirectory: result.rootDirectory,
        sourceHash: result.manifest.sourceHash,
        batches: result.manifest.batches.length,
        plannedSectionRows: plannedRows,
        execution: result.execution ?? null,
      },
      null,
      2,
    )}\n`,
  );
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url).toLowerCase() ===
    path.resolve(process.argv[1]).toLowerCase();

if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
