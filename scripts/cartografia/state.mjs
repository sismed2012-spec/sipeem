import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export async function loadExecutionState(artifactRoot) {
  const filePath = path.join(artifactRoot, "execution-state.json");
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    return {
      confirmed_checksums: Array.isArray(parsed.confirmed_checksums) ? parsed.confirmed_checksums : [],
      validation_runs: Number.isSafeInteger(parsed.validation_runs) ? parsed.validation_runs : 0,
      publication_confirmed: parsed.publication_confirmed === true,
    };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return { confirmed_checksums: [], validation_runs: 0, publication_confirmed: false };
  }
}

export async function saveExecutionState(artifactRoot, state) {
  const filePath = path.join(artifactRoot, "execution-state.json");
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporary, filePath);
}
