import path from "node:path";
import { readFile } from "node:fs/promises";

import {
  assertDevProjectRef,
  buildNpmExecInvocation,
  buildSupabaseDbQueryArgs,
  runCommandOnce,
} from "../lista-nominal/supabase-cli.mjs";

import { hashFile } from "./archive.mjs";
import { assertCartographyTransportBudget, buildValidateSql } from "./sql-batches.mjs";
import { assertValidationCheckpoint, assertValidationCursor } from "./validation-checkpoint.mjs";

const MODES = new Set(["preflight", "import", "validate", "publish"]);

export function parseCartographyResponse(stdout, mode, batch) {
  const parsed = JSON.parse(stdout);
  const rpc = mode === "validate" ? "rpc_validar_version_cartografica_paso_exacto"
    : mode === "publish" ? "rpc_publicar_version_cartografica"
    : batch.id === "start" ? "rpc_iniciar_carga_cartografica"
    : batch.id === "receipts" ? "rpc_registrar_cobertura_limites_localidad"
    : "rpc_importar_lote_cartografico_sin_replay";
  if (!Array.isArray(parsed.rows) || parsed.rows.length !== 1 ||
      Object.keys(parsed.rows[0] ?? {}).length !== 1) throw new Error("Invalid RPC row envelope");
  const response = parsed.rows[0][rpc];
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new Error("Missing expected RPC acknowledgement");
  }
  const integer = (key, minimum = 0) => {
    if (!Number.isSafeInteger(response[key]) || response[key] < minimum) {
      throw new Error(`Invalid RPC ${key}`);
    }
  };
  if (rpc === "rpc_importar_lote_cartografico_sin_replay") {
    for (const key of ["recibidos", "insertados", "repetidos", "rechazados"]) integer(key);
    integer("carga_id", 1);
    integer("registro_confirmado", 1);
    if (response.recibidos !== response.insertados + response.repetidos + response.rechazados) {
      throw new Error("RPC counters do not reconcile");
    }
    const range = /^([A-Z_]+):([0-9]+)-([0-9]+)$/.exec(batch.id);
    if (range && (response.capa !== range[1] || response.registro_confirmado !== Number(range[3]))) {
      throw new Error("RPC acknowledgement belongs to another batch");
    }
  } else if (mode === "validate") {
    assertValidationCheckpoint(batch.checkpoint, batch.checkpoint?.version_key);
    integer("cartografia_version_id", 1);
    integer("errores");
    integer("procesados");
    integer("advertencias");
    const phases = ["PADRES", "SOLAPES", "COBERTURA", "CONTEOS", "COMPLETA"];
    if (typeof response.completa !== "boolean" || !phases.includes(response.fase) ||
        response.completa !== (response.fase === "COMPLETA") ||
        response.cartografia_version_id !== batch.checkpoint.cartografia_version_id ||
        response.snapshot_sha256 !== batch.checkpoint.snapshot_sha256) {
      throw new Error("Invalid validation state");
    }
    assertValidationCursor(response.fase, response.cursor);
    const order = ["SIN_INICIAR", ...phases];
    const from = order.indexOf(batch.checkpoint.fase);
    const to = order.indexOf(response.fase);
    const currentCursor = Object.values(batch.checkpoint.cursor)[0];
    const nextCursor = Object.values(response.cursor)[0];
    const advanced = to === from
      ? Number.isSafeInteger(currentCursor) && nextCursor > currentCursor
      : to === from + 1 && Object.values(response.cursor).every((value) => value === 0);
    // A terminal failure is evidence of a committed failed validation, not an unknown ACK.
    if (!advanced && !(response.completa && response.errores > 0)) {
      throw new Error("Validation acknowledgement did not advance the expected checkpoint");
    }
  } else if (mode === "publish") integer("version_seleccionada_id", 1);
  else {
    integer("carga_id", 1);
    integer("cartografia_version_id", 1);
  }
  return response;
}

export async function executeCartographyPlan(
  plan,
  {
    mode = "preflight",
    projectRef,
    artifactRoot,
    confirmedChecksums = new Set(),
    runCommand = runCommandOnce,
    calculateFileHash = hashFile,
    readSql = (file) => readFile(file, "utf8"),
    onBatchConfirmed = async () => {},
    onBatchBlocked = async () => {},
    onBatchStarted = async () => {},
    reviewRequired = false,
  } = {},
) {
  if (!MODES.has(mode)) throw new Error(`Unsupported cartography execution mode: ${mode}`);
  const selected = mode === "preflight" ? plan.import : plan[mode];
  if (!Array.isArray(selected)) throw new Error(`Plan has no ${mode} stage`);
  if (mode !== "preflight") {
    assertDevProjectRef(projectRef);
    if (reviewRequired) throw new Error("REVIEW_REQUIRED: audit the artifact before any further execution");
  }
  if (mode === "validate" && selected.length !== 1) {
    throw new Error("Exactly one validation checkpoint is required");
  }
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
    const sql = await readSql(resolvedFile);
    assertCartographyTransportBudget(sql);
    if (mode === "validate") {
      const checkpoint = batch.checkpoint;
      assertValidationCheckpoint(checkpoint, checkpoint?.version_key);
      if (sql !== buildValidateSql({ versionKey: checkpoint.version_key, checkpoint })) {
        throw new Error("SQL does not match the exact validation checkpoint");
      }
      if (confirmedChecksums.has(batch.checksum)) {
        throw new Error("Validation checkpoint already confirmed; do not replay");
      }
    }
  }
  const planned = selected.map((batch) => batch.id);
  if (mode === "preflight") {
    return { mode, planned, skipped: [], completed: [] };
  }

  const skipped = [];
  const completed = [];
  const responses = [];
  for (const batch of selected) {
    if (confirmedChecksums.has(batch.checksum)) {
      skipped.push(batch.id);
      continue;
    }
    const npmArgs = buildSupabaseDbQueryArgs(batch.filePath, projectRef);
    const invocation = buildNpmExecInvocation(npmArgs);
    await onBatchStarted(batch);
    let result;
    try {
      result = await runCommand(invocation.command, invocation.args);
    } catch {
      await onBatchBlocked(batch, { stdout: "", review_required: true, reason: "PROCESS_RESULT_UNKNOWN" });
      throw new Error(`REVIEW_REQUIRED: ${batch.id} process result unknown. No automatic retry was attempted.`);
    }
    if (result.exitCode !== 0) {
      await onBatchBlocked(batch, { ...result, review_required: true, reason: "COMMAND_FAILED" });
      throw new Error(
        `Cartography step ${batch.id} failed. No automatic retry was attempted. ${result.stderr ?? ""}`.trim(),
      );
    }
    let response;
    try {
      response = parseCartographyResponse(result.stdout, mode, batch);
    } catch {
      await onBatchBlocked(batch, { ...result, review_required: true, reason: "ACKNOWLEDGEMENT_UNKNOWN" });
      throw new Error(`REVIEW_REQUIRED: ${batch.id} acknowledgement unknown; audit remote state, do not replay.`);
    }
    const review_required = (response.rechazados ?? 0) > 0 || (response.errores ?? 0) > 0;
    await onBatchConfirmed(batch, { ...result, response, review_required });
    confirmedChecksums.add(batch.checksum);
    completed.push(batch.id);
    responses.push({ id: batch.id, response });
    if (review_required) {
      throw new Error(`REVIEW_REQUIRED: ${batch.id} committed with rechazados=${response.rechazados ?? 0}, errores=${response.errores ?? 0}; do not replay.`);
    }
  }
  return { mode, planned, skipped, completed, responses };
}
