import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { buildRecoveryManifest, validateRecoveryManifest } from "./manifest.mjs";

function resolveInside(repoRoot, filePath, label) {
  if (typeof filePath !== "string" || filePath.length === 0) {
    throw new Error(`${label} path is required`);
  }
  const root = path.resolve(repoRoot);
  const resolved = path.resolve(root, filePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${label} path must stay inside the repository`);
  }
  return resolved;
}

async function readJson(filePath, label) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

async function assertMissing(filePath) {
  try {
    await access(filePath);
    throw new Error("Recovery manifest already exists and will not be overwritten");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

export async function freezeRecoveryManifest({ outputPath, input, context = {} }) {
  const repoRoot = path.resolve(input?.repoRoot ?? context.repoRoot ?? process.cwd());
  const output = resolveInside(repoRoot, outputPath, "Output");
  await assertMissing(output);
  const predecessorManifestPath = resolveInside(repoRoot, input?.predecessorManifestPath, "Predecessor manifest");
  const predecessorJournalPath = resolveInside(repoRoot, input?.predecessorJournalPath, "Predecessor journal");
  const dataPolicyPath = resolveInside(repoRoot, input?.dataPolicyPath, "Data policy");
  const [predecessorManifest, predecessorJournal, dataPolicy] = await Promise.all([
    readJson(predecessorManifestPath, "Predecessor manifest"),
    readJson(predecessorJournalPath, "Predecessor journal"),
    readJson(dataPolicyPath, "Data policy"),
  ]);
  const manifest = await buildRecoveryManifest({
    repoRoot,
    promotionId: input.promotionId,
    createdAt: input.createdAt,
    sourceCommit: input.sourceCommit,
    sourceRef: input.sourceRef,
    targetRef: input.targetRef,
    sourcePostgres: input.sourcePostgres,
    targetPostgres: input.targetPostgres,
    migrationDirectory: input.migrationDirectory,
    dataPolicy,
    expectations: input.expectations,
    predecessorManifest,
    predecessorJournal,
    rollbackEvidenceSha256: input.rollbackEvidenceSha256,
    preseededEvidenceSha256: input.preseededEvidenceSha256,
  });
  await validateRecoveryManifest(manifest, {
    repoRoot,
    currentCommit: context.currentCommit ?? input.sourceCommit,
    isAncestor: context.isAncestor,
    loadPredecessor: async (expectedHash) => {
      if (predecessorManifest.manifestSha256 !== expectedHash) {
        throw new Error("Explicit predecessor does not match recovery identity");
      }
      return { predecessorManifest, predecessorJournal };
    },
  });
  await mkdir(path.dirname(output), { recursive: true });
  const temporaryPath = `${output}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporaryPath, output);
  return manifest;
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--input", "--output"].includes(flag) || !value) {
      throw new Error("Usage: freeze-recovery-manifest --input config.json --output manifest.json");
    }
    values[flag.slice(2)] = value;
  }
  if (!values.input || !values.output) {
    throw new Error("Usage: freeze-recovery-manifest --input config.json --output manifest.json");
  }
  return values;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const input = await readJson(resolveInside(repoRoot, args.input, "Input"), "Freeze input");
  const manifest = await freezeRecoveryManifest({ outputPath: args.output, input: { ...input, repoRoot } });
  process.stdout.write(`${JSON.stringify({ status: "FROZEN", manifestSha256: manifest.manifestSha256 })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
