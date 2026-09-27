import { spawn } from "node:child_process";

export const DEV_PROJECT_REF = "nppvprbfmjbhwheghipa";

function assertDevProjectRef(projectRef) {
  if (projectRef !== DEV_PROJECT_REF) {
    throw new Error(`Only SIPEEM-DEV is allowed (${DEV_PROJECT_REF})`);
  }
}

export function buildSupabaseDbQueryArgs(filePath, projectRef) {
  assertDevProjectRef(projectRef);
  return [
    "exec", "supabase", "--", "db", "query", "--linked",
    "--project-ref", projectRef, "--file", filePath,
  ];
}

export function runCommandOnce(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

export async function executeManifest(manifest, {
  apply,
  projectRef,
  confirmedChecksums = new Set(),
  runCommand = runCommandOnce,
  onBatchConfirmed = async () => {},
} = {}) {
  assertDevProjectRef(projectRef);
  const planned = manifest.batches.map((batch) => batch.id);
  if (!apply) return { mode: "dry-run", planned, skipped: [], completed: [] };

  const skipped = [];
  const completed = [];
  for (const batch of manifest.batches) {
    if (confirmedChecksums.has(batch.checksum)) {
      skipped.push(batch.id);
      continue;
    }
    const args = buildSupabaseDbQueryArgs(batch.filePath, projectRef);
    const result = await runCommand("npm.cmd", args);
    if (result.exitCode !== 0) {
      throw new Error(
        `Batch ${batch.id} failed; resume checksum ${batch.checksum}. No automatic retry was attempted.`
      );
    }
    await onBatchConfirmed(batch, result);
    confirmedChecksums.add(batch.checksum);
    completed.push(batch.id);
  }
  return { mode: "apply", planned, skipped, completed };
}
