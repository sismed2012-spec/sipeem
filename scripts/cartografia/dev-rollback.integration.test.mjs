import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { hashFile } from "./archive.mjs";
import { buildNpmExecInvocation, buildSupabaseDbQueryArgs, DEV_PROJECT_REF, runCommandOnce } from "../lista-nominal/supabase-cli.mjs";

// Opt-in only: executes real RPCs in DEV, always rolling back the transaction.
test("DEV real start, receipts and ENTIDAD import roll back without publishing", {
  skip: process.env.SIPEEM_CARTOGRAFIA_DEV_ROLLBACK_TEST !== "1",
  timeout: 120_000,
}, async () => {
  const artifact = path.resolve(process.env.SIPEEM_CARTOGRAFIA_ARTIFACT ?? "");
  assert.ok(process.env.SIPEEM_CARTOGRAFIA_ARTIFACT, "A sealed artifact is required");
  const preflight = JSON.parse(await readFile(path.join(artifact, "preflight.json"), "utf8"));
  assert.equal(preflight.database_compatibility.applyAllowedByCurrentSchema, true);
  const plan = JSON.parse(await readFile(path.join(artifact, "plan.json"), "utf8"));
  const selected = plan.import.slice(0, 3);
  assert.deepEqual(selected.map((item) => item.id), ["start", "receipts", "ENTIDAD:1-1"]);
  const key = `ENSAYO_IMPORTADOR_${randomUUID().replaceAll("-", "").toUpperCase()}`;
  const bodies = [];
  for (const step of selected) {
    const relative = path.relative(artifact, path.resolve(step.filePath));
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
    assert.equal(await hashFile(step.filePath), step.checksum);
    const sql = await readFile(step.filePath, "utf8");
    const prefix = "begin;\nset local lock_timeout = '10s';\nset local statement_timeout = '15min';\n";
    assert.ok(sql.startsWith(prefix) && sql.endsWith("\ncommit;\n"));
    const body = sql.slice(prefix.length, -"\ncommit;\n".length);
    assert.ok(body.includes(`'${preflight.version.clave}'`));
    assert.doesNotMatch(body, /rpc_publicar|rpc_validar|\bcommit\b/i);
    bodies.push(body.replaceAll(`'${preflight.version.clave}'`, `'${key}'`));
  }
  const scratch = await mkdtemp(path.join(tmpdir(), "sipeem-dev-rollback-"));
  try {
    const file = path.join(scratch, "smoke.sql");
    await writeFile(file, `begin;\nset local lock_timeout='10s';\nset local statement_timeout='90s';\n
do $$ begin
  if exists(select 1 from public.cartografia_versiones where clave='${key}') then
    raise exception 'Test key already exists';
  end if;
end $$;
${bodies.join("\n")}
do $$ begin
  if not exists(
    select 1 from public.cartografia_versiones v
    join public.cargas_cartograficas c using(cartografia_version_id)
    join public.cargas_cartograficas_lotes l using(carga_id, cartografia_version_id)
    join public.cartografia_entidades e using(cartografia_version_id)
    where v.clave='${key}' and not v.es_predeterminada
      and v.estado='CARGANDO' and c.estado='CARGANDO'
      and l.capa='ENTIDAD' and l.registro_desde=1 and l.registro_hasta=1
      and l.insertados=1 and l.rechazados=0
  ) then raise exception 'Real ENTIDAD import was not confirmed'; end if;
end $$;
rollback;
select '${key}' as ensayo, not exists(
  select 1 from public.cartografia_versiones where clave='${key}'
) as rollback_confirmado;
`, "utf8");
    const invocation = buildNpmExecInvocation(buildSupabaseDbQueryArgs(file, DEV_PROJECT_REF));
    const result = await runCommandOnce(invocation.command, invocation.args);
    assert.equal(result.exitCode, 0, `${result.stderr}\n${result.stdout}`);
    assert.match(result.stdout, /"rollback_confirmado"\s*:\s*true/);
    assert.ok(result.stdout.includes(key));
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
