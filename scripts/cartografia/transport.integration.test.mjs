import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { hashFile } from "./archive.mjs";
import { buildNpmExecInvocation, buildSupabaseDbQueryArgs, DEV_PROJECT_REF, runCommandOnce } from "../lista-nominal/supabase-cli.mjs";

test("largest replanned import SQL passes native DEV EXPLAIN without execution", {
  skip: process.env.SIPEEM_CARTOGRAFIA_TRANSPORT_PROBE !== "1", timeout: 60_000,
}, async () => {
  assert.ok(process.env.SIPEEM_CARTOGRAFIA_ARTIFACT);
  const root = path.resolve(process.env.SIPEEM_CARTOGRAFIA_ARTIFACT);
  const plan = JSON.parse(await readFile(path.join(root, "plan.json"), "utf8"));
  let largest = "";
  for (const step of plan.import.slice(2)) {
    const relative = path.relative(root, path.resolve(step.filePath));
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
    assert.equal(await hashFile(step.filePath), step.checksum);
    const sql = await readFile(step.filePath, "utf8");
    assert.ok(Buffer.byteLength(JSON.stringify({ query: sql }), "utf8") + 4096 <= 900_000);
    if (Buffer.byteLength(sql) > Buffer.byteLength(largest)) largest = sql;
  }
  assert.ok(largest);
  const prefix = "begin;\nset local lock_timeout = '10s';\nset local statement_timeout = '15min';\n";
  assert.ok(largest.startsWith(prefix) && largest.endsWith("\ncommit;\n"));
  const body = largest.slice(prefix.length, -"\ncommit;\n".length);
  assert.ok(body.startsWith("select public.rpc_importar_lote_cartografico_sin_replay("));
  assert.equal(body.split(";").length, 2);
  const scratch = await mkdtemp(path.join(tmpdir(), "sipeem-transport-probe-"));
  try {
    const file = path.join(scratch, "probe.sql");
    await writeFile(file, `begin read only;\nEXPLAIN (ANALYZE false, FORMAT JSON) ${body}\nrollback;\n`);
    const invocation = buildNpmExecInvocation(buildSupabaseDbQueryArgs(file, DEV_PROJECT_REF));
    const result = await runCommandOnce(invocation.command, invocation.args);
    assert.equal(result.exitCode, 0, `${result.stderr}\n${result.stdout}`);
    assert.ok(JSON.parse(result.stdout).rows[0]["QUERY PLAN"]);
  } finally { await rm(scratch, { recursive: true, force: true }); }
});
