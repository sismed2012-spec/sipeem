import { assertDevProjectRef } from "../lista-nominal/supabase-cli.mjs";

export function assertValidationCursor(phase, cursor) {
  if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) {
    throw new Error("Invalid validation checkpoint cursor");
  }
  const key = ["PADRES", "SOLAPES"].includes(phase) ? "cartografia_seccion_id"
    : phase === "COBERTURA" ? "cartografia_municipio_id" : null;
  if (key ? Object.keys(cursor).length !== 1 || !Number.isSafeInteger(cursor[key]) || cursor[key] < 0
    : Object.keys(cursor).length !== 0) {
    throw new Error("Validation checkpoint cursor does not match its phase");
  }
}

export function assertValidationCheckpoint(checkpoint, versionKey) {
  if (!checkpoint || checkpoint.schema_version !== 1 ||
      typeof versionKey !== "string" || !versionKey.trim() || checkpoint.version_key !== versionKey ||
      !Number.isSafeInteger(checkpoint.cartografia_version_id) || checkpoint.cartografia_version_id < 1 ||
      !["SIN_INICIAR", "PADRES", "SOLAPES", "COBERTURA", "CONTEOS"].includes(checkpoint.fase) ||
      typeof checkpoint.snapshot_sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(checkpoint.snapshot_sha256 ?? "")) {
    throw new Error("A valid exact validation checkpoint is required");
  }
  assertDevProjectRef(checkpoint.project_ref);
  assertValidationCursor(checkpoint.fase, checkpoint.cursor);
}
