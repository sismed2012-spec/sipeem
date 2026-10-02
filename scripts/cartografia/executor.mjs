import path from "node:path";

import {
  assertDevProjectRef,
  buildNpmExecInvocation,
  buildSupabaseDbQueryArgs,
  runCommandOnce,
} from "../lista-nominal/supabase-cli.mjs";

import { hashFile } from "./archive.mjs";

const MODES = new Set(["preflight", "import", "validate", "publish"]);

export async function executeCartographyPlan(
  plan,
  {
    mode = "preflight",
    projectRef,
    artifactRoot,
    confirmedChecksums = new Set(),
    runCommand = runCommandOnce,
    calculateFileHash = hashFile,
    onBatchConfirmed = async () => {},
  } = {},
) {
  if (!MODES.has(mode)) throw new Error(`Unsupported cartography execution mode: ${mode}`);
  const selected = mode === "preflight" ? plan.import : plan[mode];
  if (!Array.isArray(selected)) throw new Error(`Plan has no ${mode} stage`);
  if (typeof artifactRoot !== "string" || !artifactRoot.trim()) {
    throw new Error("Cartography artifact root is required");
  }
  const resolvedRoot = path.resolve(artifactRoot);
  for (const batch of selected) {
    if (typeof batch?.id !== "string" || !batch.id || typeof batch.filePath !== "string" ||
        !/^[0-9a-f]{64}$/.test(batch.checksum ?? "")) {
      throw new Error("Cartography plan contains an invalid step");
    }
    const resolvedFile = path.resolve(batch.filePath);
    const relative = path.relative(resolvedRoot, resolvedFile);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)) {
      throw new Error(`Cartography step ${batch.id} is outside the selected artifact`);
    }
    const actualChecksum = await calculateFileHash(resolvedFile);
    if (actualChecksum !== batch.checksum) {
      throw new Error(`Cartography step ${batch.id} checksum differs from the sealed plan`);
    }
  }
  const planned = selected.map((batch) => batch.id);
  if (mode === "preflight") {
    return { mode, planned, skipped: [], completed: [] };
  }

  assertDevProjectRef(projectRef);
  const skipped = [];
  const completed = [];
  for (const batch of selected) {
    if (confirmedChecksums.has(batch.checksum)) {
      skipped.push(batch.id);
      continue;
    }
    const npmArgs = buildSupabaseDbQueryArgs(batch.filePath, projectRef);
    const invocation = buildNpmExecInvocation(npmArgs);
    const result = await runCommand(invocation.command, invocation.args);
    if (result.exitCode !== 0) {
      throw new Error(
        `Cartography step ${batch.id} failed. No automatic retry was attempted. ${result.stderr ?? ""}`.trim(),
      );
    }
    await onBatchConfirmed(batch, result);
    confirmedChecksums.add(batch.checksum);
    completed.push(batch.id);
  }
  return { mode, planned, skipped, completed };
}
