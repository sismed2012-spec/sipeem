import { readFile, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyIterRow,
  parseIterDictionary,
  readIterArchive,
} from "./demografia/iter-parser.mjs";
import { assertExpectedIterProfile, buildIterProfile } from "./demografia/profile.mjs";
import { buildCrosswalkBatch } from "./demografia/crosswalk.mjs";
import {
  buildIndicatorBatches,
  buildLocalityBatches,
  buildSourceBatch,
  normalizeLocalityRow,
} from "./demografia/sql-batches.mjs";
import { DEV_PROJECT_REF, executeManifest } from "./demografia/supabase-cli.mjs";

function assertDev(projectRef) {
  if (projectRef !== DEV_PROJECT_REF) {
    throw new Error(`Only SIPEEM-DEV is allowed (${DEV_PROJECT_REF})`);
  }
}

export function parseImportArgs(argv) {
  let zipPath = null;
  let projectRef = null;
  let apply = false;
  let cartographyVersionId = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") {
      apply = true;
    } else if (argument === "--zip") {
      zipPath = argv[index + 1] ?? null;
      index += 1;
    } else if (argument === "--project-ref") {
      projectRef = argv[index + 1] ?? null;
      index += 1;
    } else if (argument === "--cartografia-version-id") {
      cartographyVersionId = Number(argv[index + 1]);
      index += 1;
    } else if (!argument.startsWith("--") && zipPath === null) {
      zipPath = argument;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!zipPath) throw new Error("An ITER ZIP path is required");
  if (cartographyVersionId !== null && (
    !Number.isSafeInteger(cartographyVersionId) || cartographyVersionId <= 0
  )) {
    throw new Error("cartografia-version-id must be a positive integer");
  }
  assertDev(projectRef);
  return {
    zipPath,
    projectRef,
    apply,
    ...(cartographyVersionId === null ? {} : { cartographyVersionId }),
  };
}

export function withCrosswalkBatch(prepared, cartographyVersionId) {
  if (cartographyVersionId == null) return prepared;
  return {
    ...prepared,
    batches: [
      ...prepared.batches,
      buildCrosswalkBatch({ sourceHash: prepared.sourceHash, cartographyVersionId }),
    ],
  };
}

export async function prepareImportPackage(zipPath, options = {}) {
  const archive = await readIterArchive(zipPath);
  const profile = assertExpectedIterProfile(buildIterProfile(archive));
  const indicators = parseIterDictionary(archive.dictionaryText, archive.headers);
  const localities = archive.rows
    .map((row, index) => ({ row, sourceRow: index + 2 }))
    .filter(({ row }) => classifyIterRow(row) === "LOCALITY")
    .map(({ row, sourceRow }) => normalizeLocalityRow(row, archive.headers, sourceRow));
  const sourceProfile = {
    ...profile,
    sourceHash: archive.sourceHash,
    fileName: path.basename(zipPath),
    encodings: archive.encodings,
    metadata: { members: archive.members },
  };
  const batches = [
    buildSourceBatch(sourceProfile),
    ...buildIndicatorBatches(indicators, { sourceHash: archive.sourceHash }),
    ...buildLocalityBatches(localities, { sourceHash: archive.sourceHash }),
  ];
  return withCrosswalkBatch(
    { sourceHash: archive.sourceHash, profile: sourceProfile, batches },
    options.cartographyVersionId
  );
}

export async function writeImportArtifacts(prepared, rootDirectory) {
  await mkdir(rootDirectory, { recursive: true });
  const batches = [];
  for (const batch of prepared.batches) {
    const filePath = path.resolve(rootDirectory, batch.fileName);
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
    profile: prepared.profile,
    batches,
  };
  await writeFile(
    path.join(rootDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
  return manifest;
}

async function loadConfirmedChecksums(statePath) {
  try {
    const state = JSON.parse(await readFile(statePath, "utf8"));
    return new Set(state.confirmedChecksums ?? []);
  } catch (error) {
    if (error && error.code === "ENOENT") return new Set();
    throw error;
  }
}

async function saveConfirmedChecksums(statePath, checksums) {
  const temporaryPath = `${statePath}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify({ confirmedChecksums: [...checksums].sort() }, null, 2)}\n`,
    "utf8"
  );
  await rename(temporaryPath, statePath);
}

export async function runImport(options, dependencies = {}) {
  assertDev(options.projectRef);
  const preparePackage = dependencies.preparePackage ?? prepareImportPackage;
  const writeArtifacts = dependencies.writeArtifacts ?? writeImportArtifacts;
  const execute = dependencies.execute ?? executeManifest;
  const prepared = await preparePackage(options.zipPath, options);
  const rootDirectory = dependencies.rootDirectory
    ?? path.resolve(".artifacts", "demografia", prepared.sourceHash);
  const manifest = await writeArtifacts(prepared, rootDirectory);
  if (!options.apply) return { mode: "dry-run", rootDirectory, manifest };

  const statePath = path.join(rootDirectory, "run-state.json");
  const confirmedChecksums = await loadConfirmedChecksums(statePath);
  const execution = await execute(manifest, {
    apply: true,
    projectRef: options.projectRef,
    confirmedChecksums,
    onBatchConfirmed: async (batch) => {
      confirmedChecksums.add(batch.checksum);
      await saveConfirmedChecksums(statePath, confirmedChecksums);
    },
  });
  return { mode: "apply", rootDirectory, manifest, execution };
}

async function main() {
  const options = parseImportArgs(process.argv.slice(2));
  const result = await runImport(options);
  process.stdout.write(`${JSON.stringify({
    mode: result.mode,
    rootDirectory: result.rootDirectory,
    batches: result.manifest.batches.length,
    execution: result.execution ?? null,
  }, null, 2)}\n`);
}

const isMain = process.argv[1]
  && fileURLToPath(import.meta.url).toLowerCase() === path.resolve(process.argv[1]).toLowerCase();

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
