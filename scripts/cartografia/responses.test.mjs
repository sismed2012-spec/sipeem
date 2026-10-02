import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { hashFile } from "./archive.mjs";
import { parseCartographyResponse } from "./executor.mjs";
import { main } from "../import-ine-cartografia.mjs";
import { buildNpmExecInvocation, buildSupabaseDbQueryArgs, DEV_PROJECT_REF, runCommandOnce } from "../lista-nominal/supabase-cli.mjs";

const response = { carga_id: 10, capa: "ENTIDAD", registro_confirmado: 1,
  recibidos: 1, insertados: 0, repetidos: 0, rechazados: 1 };
const stdout = JSON.stringify({ rows: [{ rpc_importar_lote_cartografico_sin_replay: response }] });

test("RPC parsing rejects missing, unsafe, inconsistent and wrong-batch acknowledgements", () => {
  const step = { id: "ENTIDAD:1-1" };
  assert.deepEqual(parseCartographyResponse(stdout, "import", step), response);
  for (const invalid of ["{}", '{"rows":[]}', '{"rows":[{}]}',
    JSON.stringify({ rows: [{ rpc_importar_lote_cartografico_sin_replay: { ...response, rechazados: "1" } }] }),
    JSON.stringify({ rows: [{ rpc_importar_lote_cartografico_sin_replay: { ...response, recibidos: 2 } }] }),
    JSON.stringify({ rows: [{ rpc_importar_lote_cartografico_sin_replay: { ...response, capa: "SECCION" } }] }),
  ]) assert.throws(() => parseCartographyResponse(invalid, "import", step));
});

test("validation rejects malformed counters, cursor, hash and contradictory terminal states", () => {
  const valid = { cartografia_version_id: 10, errores: 0, completa: false, fase: "PADRES",
    procesados: 250, advertencias: 0, cursor: { cartografia_seccion_id: 250 }, snapshot_sha256: "a".repeat(64) };
  const parse = (value) => parseCartographyResponse(JSON.stringify({ rows: [{
    rpc_validar_version_cartografica_lote: value,
  }] }), "validate", { id: "validate-next" });
  assert.deepEqual(parse(valid), valid);
  for (const delta of [{ fase: "INVALID_PHASE" }, { procesados: "broken" }, { advertencias: -1 },
    { cursor: [] }, { cursor: { cartografia_seccion_id: "250" } },
    { snapshot_sha256: "invalid" }, { completa: true }, { fase: "COMPLETA" },
  ]) assert.throws(() => parse({ ...valid, ...delta }));
});

test("CLI persists rejected commit and blocks every later mutating mode after restart", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sipeem-rpc-evidence-"));
  try {
    const filePath = path.join(root, "batch.sql");
    await writeFile(filePath, "select 1;\n");
    const checksum = await hashFile(filePath);
    const batch = { id: "ENTIDAD:1-1", filePath, checksum };
    await writeFile(path.join(root, "plan.json"), JSON.stringify({ import: [batch], validate: [batch], publish: [batch] }));
    await writeFile(path.join(root, "preflight.json"), JSON.stringify({ database_compatibility: { applyAllowedByCurrentSchema: true } }));
    let calls = 0;
    const logs = [];
    const dependencies = { runCommand: async () => {
      calls++;
      const pending = JSON.parse(await readFile(path.join(root, "execution-state.json")));
      assert.equal(pending.review_required, true);
      assert.equal(pending.responses.at(-1).reason, "EXECUTION_STARTED");
      return { exitCode: 0, stderr: "", stdout };
    }, log: (value) => logs.push(JSON.parse(value)) };
    const args = ["--artifact", root, "--project-ref", "nppvprbfmjbhwheghipa"];
    await assert.rejects(main([...args, "--apply"], dependencies), /REVIEW_REQUIRED.*rechazados/);
    const state = JSON.parse(await readFile(path.join(root, "execution-state.json")));
    assert.equal(state.review_required, true);
    assert.deepEqual(state.confirmed_checksums, [checksum]);
    assert.deepEqual(state.responses.at(-1).response, response);
    assert.equal(state.responses.at(-1).committed, true);
    assert.deepEqual(logs[0].response, response);
    for (const mode of ["--apply", "--validate", "--publish"]) {
      await assert.rejects(main([...args, mode], dependencies), /REVIEW_REQUIRED/);
    }
    assert.equal(calls, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("native DEV read-only output preserves the rejected counter through the parser", {
  skip: process.env.SIPEEM_CARTOGRAFIA_RESPONSE_PROBE !== "1",
  timeout: 60_000,
}, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sipeem-response-probe-"));
  try {
    const file = path.join(root, "probe.sql");
    await writeFile(file, `begin read only;
select jsonb_build_object('carga_id',10,'capa','ENTIDAD','registro_confirmado',1,
'recibidos',1,'insertados',0,'repetidos',0,'rechazados',1)
as rpc_importar_lote_cartografico_sin_replay;
rollback;
`);
    const invocation = buildNpmExecInvocation(buildSupabaseDbQueryArgs(file, DEV_PROJECT_REF));
    const result = await runCommandOnce(invocation.command, invocation.args);
    assert.equal(result.exitCode, 0, result.stderr);
    assert.deepEqual(parseCartographyResponse(result.stdout, "import", { id: "ENTIDAD:1-1" }), response);
  } finally { await rm(root, { recursive: true, force: true }); }
});
