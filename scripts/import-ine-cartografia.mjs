import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { executeCartographyPlan } from "./cartografia/executor.mjs";
import { prepareCartographyArtifacts, prepareValidationStep } from "./cartografia/prepare.mjs";
import { loadExecutionState, saveExecutionState } from "./cartografia/state.mjs";
import { assertDevProjectRef } from "./lista-nominal/supabase-cli.mjs";

function parseArgs(argv) {
  const result = { mode: "preflight" };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--apply") result.mode = "import";
    else if (item === "--validate") result.mode = "validate";
    else if (item === "--publish") result.mode = "publish";
    else if (item.startsWith("--")) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${item}`);
      index += 1;
      if (item === "--mgs") result.mgsPath = path.resolve(value);
      else if (item === "--bgd") result.bgdPath = path.resolve(value);
      else if (item === "--version-key") result.versionKey = value;
      else if (item === "--version-name") result.versionName = value;
      else if (item === "--expected-date") result.expectedPublicationDate = value;
      else if (item === "--artifact") result.artifactRoot = path.resolve(value);
      else if (item === "--project-ref") result.projectRef = value;
      else if (item === "--checkpoint") result.checkpointPath = path.resolve(value);
      else throw new Error(`Unknown option: ${item}`);
    } else throw new Error(`Unexpected argument: ${item}`);
  }
  const modes = argv.filter((item) => ["--apply", "--validate", "--publish"].includes(item));
  if (modes.length > 1) throw new Error("Choose only one of --apply, --validate or --publish");
  if (result.checkpointPath && result.mode !== "validate") throw new Error("--checkpoint requires --validate");
  if (result.mode === "validate" && !result.artifactRoot) throw new Error("--validate requires --artifact and --checkpoint");
  return result;
}

function assertPreparationArgs(args) {
  for (const [key, label] of [
    ["mgsPath", "--mgs"],
    ["bgdPath", "--bgd"],
    ["versionKey", "--version-key"],
    ["versionName", "--version-name"],
    ["expectedPublicationDate", "--expected-date"],
  ]) {
    if (!args[key]) throw new Error(`${label} is required when preparing an artifact`);
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function main(argv = process.argv.slice(2), { runCommand, log = console.log } = {}) {
  const args = parseArgs(argv);
  let artifactRoot = args.artifactRoot;
  let plan;
  let preflight;
  if (!artifactRoot) {
    assertPreparationArgs(args);
    const prepared = await prepareCartographyArtifacts({
      ...args,
      onProgress: (message) => log(`[cartografia] ${message}`),
    });
    artifactRoot = prepared.root;
    plan = prepared.plan;
    preflight = prepared.preflight;
  } else {
    [plan, preflight] = await Promise.all([
      readJson(path.join(artifactRoot, "plan.json")),
      readJson(path.join(artifactRoot, "preflight.json")),
    ]);
  }

  if (args.mode === "import" && !preflight.database_compatibility.applyAllowedByCurrentSchema) {
    throw new Error(preflight.database_compatibility.reason);
  }
  const state = await loadExecutionState(artifactRoot);
  if (args.mode !== "preflight") {
    assertDevProjectRef(args.projectRef);
    if (state.review_required) throw new Error("REVIEW_REQUIRED: audit the artifact before any further execution");
  }
  if (args.mode === "validate") {
    if (!args.checkpointPath) throw new Error("--checkpoint is required for exact validation");
    const checkpoint = await readJson(args.checkpointPath);
    const step = await prepareValidationStep({ artifactRoot, versionKey: preflight.version?.clave, checkpoint });
    plan = { ...plan, validate: [step] };
  }
  const confirmed = new Set(args.mode === "validate"
    ? state.responses.filter((r) => r.mode === "validate" && r.committed === true).map((r) => r.checksum)
    : state.confirmed_checksums);
  const result = await executeCartographyPlan(plan, {
    mode: args.mode,
    projectRef: args.projectRef,
    artifactRoot,
    confirmedChecksums: confirmed,
    reviewRequired: state.review_required,
    runCommand,
    onBatchStarted: async (batch) => {
      state.review_required = true;
      state.responses.push({ id: batch.id, checksum: batch.checksum, mode: args.mode,
        committed: null, reason: "EXECUTION_STARTED", checkpoint: batch.checkpoint,
        observed_at: new Date().toISOString() });
      await saveExecutionState(artifactRoot, state);
    },
    onBatchBlocked: async (batch, observed) => {
      state.review_required = true;
      state.responses.push({ id: batch.id, checksum: batch.checksum, mode: args.mode,
        committed: null, reason: observed.reason, stdout: observed.stdout, checkpoint: batch.checkpoint,
        observed_at: new Date().toISOString() });
      await saveExecutionState(artifactRoot, state);
    },
    onBatchConfirmed: async (batch, observed) => {
      if (args.mode === "validate") state.validation_runs += 1;
      else {
        if (!state.confirmed_checksums.includes(batch.checksum)) {
          state.confirmed_checksums.push(batch.checksum);
        }
        if (args.mode === "publish") state.publication_confirmed = true;
      }
      state.review_required = observed.review_required;
      state.responses.push({ id: batch.id, checksum: batch.checksum, mode: args.mode,
        committed: true, response: observed.response, checkpoint: batch.checkpoint,
        observed_at: new Date().toISOString() });
      await saveExecutionState(artifactRoot, state);
      log(JSON.stringify({ step: batch.id, response: observed.response,
        review_required: observed.review_required }));
    },
  });
  log(JSON.stringify({ artifactRoot, preflight, result }, null, 2));
  return { artifactRoot, preflight, result };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
