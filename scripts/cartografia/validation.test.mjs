import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildValidateSql } from "./sql-batches.mjs";
import { executeCartographyPlan, parseCartographyResponse } from "./executor.mjs";
import { hashFile } from "./archive.mjs";
import { main } from "../import-ine-cartografia.mjs";

const checkpoint = {
  schema_version: 1, project_ref: "nppvprbfmjbhwheghipa", version_key: "ENSAYO_TEST",
  cartografia_version_id: 4037, fase: "SIN_INICIAR", cursor: {}, snapshot_sha256: "a".repeat(64),
};
const acknowledgement = {
  cartografia_version_id: 4037, completa: false, fase: "PADRES",
  cursor: { cartografia_seccion_id: 0 }, procesados: 0, errores: 0,
  advertencias: 51, snapshot_sha256: "a".repeat(64),
};
const envelope = (value, rpc = "rpc_validar_version_cartografica_paso_exacto") =>
  JSON.stringify({ rows: [{ [rpc]: value }] });

test("validation SQL binds the exact version, phase, cursor and snapshot instead of the base RPC", () => {
  const sql = buildValidateSql({ versionKey: "ENSAYO_TEST", checkpoint });
  assert.match(sql, /rpc_validar_version_cartografica_paso_exacto\(/);
  assert.doesNotMatch(sql, /rpc_validar_version_cartografica_lote\(/);
  assert.match(sql, /v\.clave = 'ENSAYO_TEST' and v\.cartografia_version_id = 4037/);
  assert.match(sql, /'SIN_INICIAR'/);
  assert.ok(sql.includes(`'${"a".repeat(64)}'`));
  assert.match(sql, /decode\('e30=','base64'\)/);
});

test("validation generation refuses missing, wrong-project, terminal or malformed checkpoints", () => {
  assert.throws(() => buildValidateSql({ versionKey: "ENSAYO_TEST" }), /checkpoint/i);
  for (const delta of [
    { schema_version: 2 }, { project_ref: "production" }, { version_key: "ANOTHER_VERSION" },
    { cartografia_version_id: 0 }, { cartografia_version_id: Number.MAX_SAFE_INTEGER + 1 },
    { snapshot_sha256: null }, { snapshot_sha256: ["a".repeat(64)] },
    { fase: "ESTRUCTURA" }, { fase: "COMPLETA" },
    { cursor: { cartografia_seccion_id: 1 } },
    { fase: "PADRES", cursor: { cartografia_seccion_id: "1" } },
    { fase: "SOLAPES", cursor: { cartografia_seccion_id: 1, extra: 0 } },
    { fase: "COBERTURA", cursor: { cartografia_seccion_id: 1 } },
  ]) assert.throws(() => buildValidateSql({ versionKey: "ENSAYO_TEST", checkpoint: { ...checkpoint, ...delta } }));
});

test("exact validation acknowledgement must belong to the selected version and snapshot", () => {
  const step = { id: "validate", checkpoint };
  assert.deepEqual(parseCartographyResponse(envelope(acknowledgement), "validate", step), acknowledgement);
  assert.throws(() => parseCartographyResponse(envelope(acknowledgement,
    "rpc_validar_version_cartografica_lote"), "validate", step));
  for (const delta of [{ cartografia_version_id: 9999 }, { snapshot_sha256: "b".repeat(64) },
    { snapshot_sha256: null }, { cursor: { wrong_key: 0 } }, { fase: "ESTRUCTURA" },
  ]) assert.throws(() => parseCartographyResponse(envelope({ ...acknowledgement, ...delta }), "validate", step));
});

test("executor refuses a legacy validation plan before opening Supabase", async () => {
  let calls = 0;
  await assert.rejects(executeCartographyPlan({ validate: [{
    id: "legacy", checksum: "a".repeat(64), filePath: "validate.sql",
  }] }, {
    mode: "validate", projectRef: checkpoint.project_ref, artifactRoot: process.cwd(),
    calculateFileHash: async () => "a".repeat(64), readSql: async () => "select 1;",
    runCommand: async () => { calls++; return { exitCode: 0, stdout: envelope(acknowledgement) }; },
  }), /checkpoint|exact/i);
  assert.equal(calls, 0);
});

test("validation refuses a non-advancing cursor, backwards phase or premature success", () => {
  for (const [cp, value] of [
    [{ ...checkpoint, fase: "PADRES", cursor: { cartografia_seccion_id: 100 } },
      { ...acknowledgement, cursor: { cartografia_seccion_id: 100 } }],
    [{ ...checkpoint, fase: "PADRES", cursor: { cartografia_seccion_id: 100 } },
      { ...acknowledgement, cursor: { cartografia_seccion_id: 99 } }],
    [{ ...checkpoint, fase: "COBERTURA", cursor: { cartografia_municipio_id: 100 } },
      { ...acknowledgement, fase: "SOLAPES", cursor: { cartografia_seccion_id: 500 } }],
    [checkpoint, { ...acknowledgement, fase: "COMPLETA", completa: true, cursor: {} }],
  ]) assert.throws(() => parseCartographyResponse(envelope(value), "validate", { checkpoint: cp }));
});

test("executor rejects multiple steps and sealed SQL that differs from the checkpoint before transport", async () => {
  const step = { id: "validate", checksum: "a".repeat(64), filePath: "validate.sql", checkpoint };
  let calls = 0;
  const options = {
    mode: "validate", projectRef: checkpoint.project_ref, artifactRoot: process.cwd(),
    calculateFileHash: async () => "a".repeat(64), readSql: async () => "select 1;",
    runCommand: async () => { calls++; },
  };
  await assert.rejects(executeCartographyPlan({ validate: [step, step] }, options), /one.*checkpoint/i);
  await assert.rejects(executeCartographyPlan({ validate: [step] }, options), /SQL.*checkpoint/i);
  assert.equal(calls, 0);
});

test("unknown exact acknowledgement preserves a pending block instead of confirming the checkpoint", async () => {
  const step = { id: "validate", checksum: "a".repeat(64), filePath: "validate.sql", checkpoint };
  let confirmed = 0;
  const blocked = [];
  await assert.rejects(executeCartographyPlan({ validate: [step] }, {
    mode: "validate", projectRef: checkpoint.project_ref, artifactRoot: process.cwd(),
    calculateFileHash: async () => "a".repeat(64),
    readSql: async () => buildValidateSql({ versionKey: "ENSAYO_TEST", checkpoint }),
    runCommand: async () => ({ exitCode: 0, stdout: envelope({ ...acknowledgement, snapshot_sha256: "b".repeat(64) }) }),
    onBatchConfirmed: async () => { confirmed++; },
    onBatchBlocked: async (_step, evidence) => { blocked.push(evidence); },
  }), /acknowledgement unknown/);
  assert.equal(confirmed, 0);
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].reason, "ACKNOWLEDGEMENT_UNKNOWN");
  assert.equal(blocked[0].review_required, true);
});

test("CLI seals one exact checkpoint and refuses to repeat its committed validation after restart", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sipeem-exact-validation-"));
  try {
    const cpPath = path.join(root, "checkpoint.json");
    await writeFile(cpPath, JSON.stringify(checkpoint));
    await writeFile(path.join(root, "plan.json"), JSON.stringify({ import: [], validate: [], publish: [] }));
    await writeFile(path.join(root, "preflight.json"), JSON.stringify({
      version: { clave: "ENSAYO_TEST" }, database_compatibility: { applyAllowedByCurrentSchema: true },
    }));
    let calls = 0;
    const dependencies = { log: () => {}, runCommand: async (_cmd, args) => {
      calls++;
      const sql = await readFile(args.at(-1), "utf8");
      assert.match(sql, /rpc_validar_version_cartografica_paso_exacto/);
      const pending = JSON.parse(await readFile(path.join(root, "execution-state.json"), "utf8"));
      assert.equal(pending.review_required, true);
      assert.deepEqual(pending.responses.at(-1).checkpoint, checkpoint);
      return { exitCode: 0, stderr: "", stdout: envelope(acknowledgement) };
    } };
    const args = ["--artifact", root, "--project-ref", checkpoint.project_ref, "--validate"];
    await assert.rejects(main(args, dependencies), /checkpoint/i);
    assert.equal(calls, 0);
    const result = await main([...args, "--checkpoint", cpPath], dependencies);
    assert.equal(result.result.completed.length, 1);
    const state = JSON.parse(await readFile(path.join(root, "execution-state.json"), "utf8"));
    assert.equal(state.validation_runs, 1);
    assert.equal(state.review_required, false);
    assert.deepEqual(state.confirmed_checksums, []);
    assert.deepEqual(state.responses.at(-1).checkpoint, checkpoint);
    const checksum = state.responses.at(-1).checksum;
    assert.equal(await hashFile(path.join(root, "sql", `validation-${checksum}.sql`)), checksum);
    await assert.rejects(main([...args, "--checkpoint", cpPath], dependencies), /already confirmed/i);
    assert.equal(calls, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
