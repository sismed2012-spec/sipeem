import { createHash } from "node:crypto";
import { access, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

const TARGET_PROJECT_REF = "cdvukcthosppezjscwod";
const EXPECTED_ROWS = 2280;
const PAGE_SIZE = 1000;

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function collectOrphanReferenceBackup({ client, capturedAt = new Date().toISOString() }) {
  const staging = await client
    .from("staging_electoral_resultados")
    .select("resultado_staging_id", { count: "exact", head: true });
  if (staging.error) throw new Error(`Staging scope query failed: ${staging.error.message}`);
  if (staging.count !== 0) {
    throw new Error(`Backup requires empty staging, received ${String(staging.count)} rows`);
  }
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("resultados_municipales_oficiales_fuerzas")
      .select("detalle_id,resultado_staging_id")
      .not("resultado_staging_id", "is", null)
      .order("detalle_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Backup query failed: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  if (rows.length !== EXPECTED_ROWS) {
    throw new Error(`Expected ${EXPECTED_ROWS} references for backup, received ${rows.length}`);
  }
  if (new Set(rows.map(({ detalle_id }) => detalle_id)).size !== rows.length) {
    throw new Error("Backup contains duplicate canonical row identities");
  }
  const rowsSha256 = sha256(rows);
  return {
    contractVersion: 1,
    kind: "resultado_staging_orphan_backup",
    targetProjectRef: TARGET_PROJECT_REF,
    capturedAt,
    rowCount: rows.length,
    rowsSha256,
    scopeGuard: { stagingRows: 0, selection: "all non-null pointers are orphaned" },
    rows,
  };
}

export async function writeBackupOnce({ backup, outputPath }) {
  if (!path.isAbsolute(outputPath)) throw new Error("Backup output path must be absolute");
  if (await exists(outputPath)) throw new Error("Backup already exists and will not be overwritten");
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp`;
  if (await exists(temporaryPath)) throw new Error("Temporary backup exists and requires review");
  await writeFile(temporaryPath, `${JSON.stringify(backup, null, 2)}\n`, "utf8");
  await rename(temporaryPath, outputPath);
  return { outputPath, rowCount: backup.rowCount, rowsSha256: backup.rowsSha256 };
}

async function main() {
  const url = process.env.TERRITORIAL_SUPABASE_URL;
  const key = process.env.TERRITORIAL_SUPABASE_SERVICE_ROLE_KEY;
  const outputPath = process.env.TERRITORIAL_BACKUP_PATH;
  if (url !== `https://${TARGET_PROJECT_REF}.supabase.co`) {
    throw new Error("Backup URL is not bound to SIPEEM-TERRITORIAL-PROD");
  }
  if (typeof key !== "string" || key.length < 20) throw new Error("Backup service key is unavailable");
  if (!outputPath) throw new Error("TERRITORIAL_BACKUP_PATH is required");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const backup = await collectOrphanReferenceBackup({ client });
  const result = await writeBackupOnce({ backup, outputPath });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "FAILED_CONFIRMED", error: error.message })}\n`);
    process.exitCode = 1;
  });
}
