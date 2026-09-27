import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readEcegWorkbook } from "./demografia/eceg-parser.mjs";
import {
  assertExpectedEcegProfile,
  buildEcegProfile,
} from "./demografia/eceg-profile.mjs";
import {
  assertEcegCoreIndicators,
  buildEcegCorrespondenceBatches,
  buildEcegIndicatorBatches,
  buildEcegSectionBatches,
  buildEcegSourceBatch,
  normalizeEcegSection,
} from "./demografia/eceg-sql-batches.mjs";
import {
  DEV_PROJECT_REF,
  executeManifest,
} from "./demografia/supabase-cli.mjs";

export const APPROVED_ECEG_XLSX_SHA256 =
  "8f409924e3f97fe4f839a8a9a2543d5d364c5ce161b87f9a322e5da4ee2bcc37";
export const APPROVED_ECEG_ZIP_SHA256 =
  "576c4821fcfd40a8b8a97c1c717b07d66ad07511bd7f81733edf0b28442b707b";

function assertDev(projectRef) {
  if (projectRef !== DEV_PROJECT_REF) {
    throw new Error(`Only SIPEEM-DEV is allowed (${DEV_PROJECT_REF})`);
  }
}

export function parseEcegImportArgs(argv) {
  let xlsxPath = null;
  let projectRef = null;
  let cartographyVersionId = null;
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") {
      apply = true;
    } else if (argument === "--xlsx") {
      xlsxPath = argv[index + 1] ?? null;
      index += 1;
    } else if (argument === "--project-ref") {
      projectRef = argv[index + 1] ?? null;
      index += 1;
    } else if (argument === "--cartografia-version-id") {
      cartographyVersionId = Number(argv[index + 1]);
      index += 1;
    } else if (!argument.startsWith("--") && xlsxPath === null) {
      xlsxPath = argument;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!xlsxPath) throw new Error("An ECEG XLSX path is required");
  assertDev(projectRef);
  if (cartographyVersionId === null) {
    throw new Error("cartografia-version-id is required");
  }
  if (!Number.isSafeInteger(cartographyVersionId) || cartographyVersionId <= 0) {
    throw new Error("cartografia-version-id must be a positive integer");
  }
  return { xlsxPath, projectRef, cartographyVersionId, apply };
}

export async function prepareEcegImportPackage(xlsxPath, options) {
  const parsed = await readEcegWorkbook(xlsxPath);
  if (parsed.sourceHash !== APPROVED_ECEG_XLSX_SHA256) {
    throw new Error(
      `Unapproved ECEG XLSX hash: ${parsed.sourceHash}; expected ${APPROVED_ECEG_XLSX_SHA256}`
    );
  }
  const profile = assertExpectedEcegProfile(buildEcegProfile(parsed));
  assertEcegCoreIndicators(parsed.indicators);
  const sourceProfile = {
    ...profile,
    sourceHash: parsed.sourceHash,
    zipHash: APPROVED_ECEG_ZIP_SHA256,
    fileName: path.basename(xlsxPath),
    sheetSchemas: parsed.sheetSchemas,
    cartographyVersionId: options.cartographyVersionId,
  };
  const sections = parsed.sections.map(normalizeEcegSection);
  const batchOptions = { sourceHash: parsed.sourceHash };
  const correspondenceOptions = {
    ...batchOptions,
    cartographyVersionId: options.cartographyVersionId,
  };
  return {
    sourceHash: parsed.sourceHash,
    profile: sourceProfile,
    batches: [
      buildEcegSourceBatch(sourceProfile),
      ...buildEcegIndicatorBatches(parsed.indicators, batchOptions),
      ...buildEcegSectionBatches(sections, batchOptions),
      ...buildEcegCorrespondenceBatches(sections, correspondenceOptions),
    ],
  };
}

export async function writeEcegImportArtifacts(prepared, rootDirectory) {
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

export async function runEcegImport(options, dependencies = {}) {
  assertDev(options.projectRef);
  const preparePackage = dependencies.preparePackage ?? prepareEcegImportPackage;
  const writeArtifacts = dependencies.writeArtifacts ?? writeEcegImportArtifacts;
  const execute = dependencies.execute ?? executeManifest;
  const loadState = dependencies.loadState ?? loadConfirmedChecksums;
  const saveState = dependencies.saveState ?? saveConfirmedChecksums;
  const prepared = await preparePackage(options.xlsxPath, options);
  const rootDirectory = dependencies.rootDirectory ?? path.resolve(
    ".artifacts",
    "demografia",
    "eceg",
    prepared.sourceHash,
    `v${options.cartographyVersionId}`
  );
  const manifest = await writeArtifacts(prepared, rootDirectory);
  if (!options.apply) return { mode: "dry-run", rootDirectory, manifest };

  const statePath = path.join(rootDirectory, "run-state.json");
  const confirmedChecksums = await loadState(statePath);
  const execution = await execute(manifest, {
    apply: true,
    projectRef: options.projectRef,
    confirmedChecksums,
    onBatchConfirmed: async (batch) => {
      confirmedChecksums.add(batch.checksum);
      await saveState(statePath, confirmedChecksums);
    },
  });
  return { mode: "apply", rootDirectory, manifest, execution };
}

async function main() {
  const options = parseEcegImportArgs(process.argv.slice(2));
  const result = await runEcegImport(options);
  process.stdout.write(`${JSON.stringify({
    mode: result.mode,
    rootDirectory: result.rootDirectory,
    sourceHash: result.manifest.sourceHash,
    profile: result.manifest.profile,
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
