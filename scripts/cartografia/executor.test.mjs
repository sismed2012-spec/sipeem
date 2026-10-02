import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import { executeCartographyPlan } from "./executor.mjs";

const plan = {
  import: [
    { id: "start", checksum: "a".repeat(64), filePath: "start.sql" },
    { id: "batch-1", checksum: "b".repeat(64), filePath: "batch-1.sql" },
    { id: "batch-2", checksum: "c".repeat(64), filePath: "batch-2.sql" },
  ],
  validate: [{ id: "validate", checksum: "d".repeat(64), filePath: "validate.sql" }],
  publish: [{ id: "publish", checksum: "e".repeat(64), filePath: "publish.sql" }],
};

const checksumByFile = new Map(
  [...plan.import, ...plan.validate, ...plan.publish]
    .map((batch) => [batch.filePath, batch.checksum]),
);

function executionOptions(overrides = {}) {
  return {
    artifactRoot: process.cwd(),
    calculateFileHash: async (filePath) => checksumByFile.get(filePath.split(/[\\/]/).at(-1)),
    ...overrides,
  };
}

function rpcResult(value, rpc = "rpc_importar_lote_cartografico_sin_replay") {
  return { exitCode: 0, stderr: "", stdout: JSON.stringify({ rows: [{ [rpc]: value }] }) };
}
const imported = { carga_id: 1793, capa: "ENTIDAD", registro_confirmado: 1,
  recibidos: 1, insertados: 1, repetidos: 0, rechazados: 0 };
function successfulResult(args) {
  if (args.at(-1).endsWith("start.sql")) return rpcResult({ carga_id: 1793, cartografia_version_id: 4025,
    estado_version: "PREPARADA", estado_carga: "PREPARADA" }, "rpc_iniciar_carga_cartografica");
  if (args.at(-1).endsWith("validate.sql")) return rpcResult({ cartografia_version_id: 4025,
    completa: false, fase: "PADRES", errores: 0, procesados: 0, advertencias: 0,
    cursor: { cartografia_seccion_id: 0 }, snapshot_sha256: "a".repeat(64) }, "rpc_validar_version_cartografica_lote");
  return rpcResult(imported);
}

describe("safe cartography executor", () => {
  it("defaults to a no-command dry run", async () => {
    let calls = 0;
    const result = await executeCartographyPlan(plan, executionOptions({
      mode: "preflight",
      runCommand: async () => { calls += 1; },
    }));
    assert.equal(calls, 0);
    assert.equal(result.mode, "preflight");
    assert.deepEqual(result.planned, ["start", "batch-1", "batch-2"]);
  });

  it("allows mutations only on SIPEEM-DEV", async () => {
    await assert.rejects(
      () => executeCartographyPlan(plan, executionOptions({ mode: "import", projectRef: "production" })),
      /SIPEEM-DEV/,
    );
  });

  it("skips locally confirmed checksums and records each new success", async () => {
    const calls = [];
    const confirmed = [];
    const result = await executeCartographyPlan(plan, executionOptions({
      mode: "import",
      projectRef: "nppvprbfmjbhwheghipa",
      confirmedChecksums: new Set(["a".repeat(64)]),
      runCommand: async (command, args) => {
        calls.push({ command, args });
        return successfulResult(args);
      },
      onBatchConfirmed: async (batch) => { confirmed.push(batch.id); },
    }));
    assert.deepEqual(result.skipped, ["start"]);
    assert.deepEqual(result.completed, ["batch-1", "batch-2"]);
    assert.deepEqual(confirmed, ["batch-1", "batch-2"]);
    assert.equal(calls.length, 2);
  });

  it("stops at the first failure and never retries", async () => {
    let calls = 0;
    await assert.rejects(
      () => executeCartographyPlan(plan, executionOptions({
        mode: "import",
        projectRef: "nppvprbfmjbhwheghipa",
        runCommand: async (_command, args) => {
          calls += 1;
          return calls === 2
            ? { exitCode: 1, stdout: "", stderr: "database unavailable" }
            : successfulResult(args);
        },
      })),
      /No automatic retry.*database unavailable/,
    );
    assert.equal(calls, 2);
  });

  it("runs validation and publication independently", async () => {
    const calls = [];
    await executeCartographyPlan(plan, executionOptions({
      mode: "validate",
      projectRef: "nppvprbfmjbhwheghipa",
      runCommand: async (_command, args) => {
        calls.push(args.at(-1));
        return successfulResult(args);
      },
    }));
    assert.equal(calls.length, 1);
    assert.match(calls[0], /validate\.sql$/);
  });

  it("rejects a changed SQL file before opening Supabase", async () => {
    let calls = 0;
    await assert.rejects(
      () => executeCartographyPlan(plan, executionOptions({
        mode: "import",
        projectRef: "nppvprbfmjbhwheghipa",
        calculateFileHash: async () => "f".repeat(64),
        runCommand: async () => {
          calls += 1;
          return { exitCode: 0, stdout: "ok", stderr: "" };
        },
      })),
      /checksum differs from the sealed plan/i,
    );
    assert.equal(calls, 0);
  });

  it("rejects SQL paths outside the selected artifact", async () => {
    const outside = structuredClone(plan);
    outside.import[0].filePath = path.resolve(process.cwd(), "..", "outside.sql");
    await assert.rejects(
      () => executeCartographyPlan(outside, executionOptions({ mode: "preflight" })),
      /outside the selected artifact/i,
    );
  });

  it("records a committed rejected batch then stops without calling the next batch", async () => {
    const confirmed = new Set(["a".repeat(64)]);
    let calls = 0;
    const evidence = [];
    await assert.rejects(executeCartographyPlan(plan, executionOptions({
      mode: "import", projectRef: "nppvprbfmjbhwheghipa", confirmedChecksums: confirmed,
      runCommand: async () => { calls++; return rpcResult({ ...imported, insertados: 0, rechazados: 1 }); },
      onBatchConfirmed: async (_batch, result) => evidence.push(result.response),
    })), /REVIEW_REQUIRED.*rechazados/);
    assert.equal(calls, 1);
    assert.equal(confirmed.has("b".repeat(64)), true);
    assert.equal(evidence[0].rechazados, 1);
  });

  it("blocks malformed successful output without confirming or replaying it", async () => {
    const evidence = [];
    let confirms = 0;
    await assert.rejects(executeCartographyPlan(plan, executionOptions({
      mode: "import", projectRef: "nppvprbfmjbhwheghipa",
      runCommand: async () => ({ exitCode: 0, stdout: "not-json", stderr: "" }),
      onBatchConfirmed: async () => { confirms++; },
      onBatchBlocked: async (_batch, result) => evidence.push(result),
    })), /REVIEW_REQUIRED/);
    assert.equal(confirms, 0);
    assert.equal(evidence[0].stdout, "not-json");
  });

  it("returns the actual validation phase and counters", async () => {
    const result = await executeCartographyPlan(plan, executionOptions({
      mode: "validate", projectRef: "nppvprbfmjbhwheghipa",
      runCommand: async (_command, args) => successfulResult(args),
    }));
    assert.equal(result.responses[0].response.fase, "PADRES");
    assert.equal(result.responses[0].response.completa, false);
  });

  it("blocks a review-required artifact before opening a database connection", async () => {
    let calls = 0;
    await assert.rejects(executeCartographyPlan(plan, executionOptions({
      mode: "import", projectRef: "nppvprbfmjbhwheghipa", reviewRequired: true,
      runCommand: async () => { calls++; },
    })), /REVIEW_REQUIRED/);
    assert.equal(calls, 0);
  });

  it("keeps failed validation evidence and stops even when the server says completa", async () => {
    let observed;
    await assert.rejects(executeCartographyPlan(plan, executionOptions({
      mode: "validate", projectRef: "nppvprbfmjbhwheghipa",
      runCommand: async () => rpcResult({ cartografia_version_id: 4025,
        completa: true, fase: "COMPLETA", errores: 2, procesados: 0, advertencias: 0,
        cursor: {}, snapshot_sha256: "a".repeat(64) }, "rpc_validar_version_cartografica_lote"),
      onBatchConfirmed: async (_batch, result) => { observed = result; },
    })), /REVIEW_REQUIRED.*errores=2/);
    assert.equal(observed.response.completa, true);
    assert.equal(observed.review_required, true);
  });

  it("accepts the actual publication acknowledgement without importing a batch", async () => {
    const result = await executeCartographyPlan(plan, executionOptions({
      mode: "publish", projectRef: "nppvprbfmjbhwheghipa",
      runCommand: async () => rpcResult({ version_anterior_id: 4025,
        version_seleccionada_id: 5000, conteos_sincronizados: {} }, "rpc_publicar_version_cartografica"),
    }));
    assert.deepEqual(result.completed, ["publish"]);
    assert.equal(result.responses[0].response.version_seleccionada_id, 5000);
  });
});
