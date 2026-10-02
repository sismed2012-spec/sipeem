import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  SECURITY_DEFINER_JUSTIFICATION,
  auditMigrations,
} from "./migration-audit.mjs";

async function fixture(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), "territorial-audit-"));
  const migrationDir = path.join(root, "migrations");
  await mkdir(migrationDir);
  await Promise.all(
    Object.entries(files).map(([name, sql]) =>
      writeFile(path.join(migrationDir, name), sql, "utf8"),
    ),
  );
  return migrationDir;
}

test("detects operational files and every forbidden SQL construct", async () => {
  const migrationDir = await fixture({
    "seed.sql": "select 1;",
    "20260901000000_unsafe.sql": [
      "begin;",
      "begin;",
      "create table private_data.secret(id bigint);",
      "drop table public.safe cascade;",
      "grant select on public.safe to public;",
      "select 'xvdqlozimvqluwxpbizx';",
      "commit;",
      "commit;",
    ].join("\n"),
  });

  const report = await auditMigrations({ migrationDir, exceptions: [] });
  const rules = new Set(report.errors.map((finding) => finding.rule));

  assert.deepEqual(
    rules,
    new Set([
      "OPERATIONAL_FILE",
      "NESTED_TRANSACTION",
      "DROP_CASCADE",
      "PROJECT_REFERENCE",
      "GRANT_TO_PUBLIC",
      "OBJECT_OUTSIDE_ALLOWED_SCHEMA",
    ]),
  );
  assert.equal(report.passed, false);
});

test("requires an exact inventoried SECURITY DEFINER exception", async () => {
  const name = "20260901000000_privileged.sql";
  const migrationDir = await fixture({
    [name]: [
      "create function territorial_private.guard()",
      "returns trigger language plpgsql",
      "security definer",
      "set search_path = pg_catalog, public, extensions, territorial_private",
      "as $$ begin return new; end $$;",
    ].join("\n"),
  });
  const exact = {
    rule: "SECURITY_DEFINER",
    file: name,
    line: 3,
    signature: "territorial_private.guard",
    justification: SECURITY_DEFINER_JUSTIFICATION,
  };

  const blocked = await auditMigrations({ migrationDir, exceptions: [] });
  assert.equal(blocked.errors[0].rule, "SECURITY_DEFINER");

  const approved = await auditMigrations({ migrationDir, exceptions: [exact] });
  assert.equal(approved.passed, true);
  assert.equal(approved.exceptionsUsed.length, 1);

  for (const [altered, expected] of [
    [{ ...exact, file: "20260901000001_wrong.sql" }, /unused exception/iu],
    [{ ...exact, line: 30 }, /unused exception/iu],
    [{ ...exact, signature: "territorial_private.other" }, /unused exception/iu],
    [{ ...exact, justification: "se ve segura" }, /malformed security exception/iu],
  ]) {
    await assert.rejects(
      auditMigrations({ migrationDir, exceptions: [altered] }),
      expected,
    );
  }
});

test("warns for one complete outer transaction and blocks misplaced control", async () => {
  const wrappedDir = await fixture({
    "20260901000000_wrapped.sql": "begin;\ncreate table public.safe(id bigint);\ncommit;\n",
  });
  const wrapped = await auditMigrations({ migrationDir: wrappedDir, exceptions: [] });
  assert.equal(wrapped.passed, true);
  assert.deepEqual(wrapped.warnings.map(({ rule }) => rule), ["OUTER_TRANSACTION"]);

  const misplacedDir = await fixture({
    "20260901000000_misplaced.sql": "select 1;\nbegin;\nselect 2;\ncommit;\n",
  });
  const misplaced = await auditMigrations({ migrationDir: misplacedDir, exceptions: [] });
  assert.equal(misplaced.passed, false);
  assert.equal(misplaced.errors[0].rule, "NESTED_TRANSACTION");
});

test("rejects malformed, duplicate and unused exceptions", async () => {
  const migrationDir = await fixture({
    "20260901000000_safe.sql": "create table public.safe(id bigint);\n",
  });
  const unused = {
    rule: "SECURITY_DEFINER",
    file: "20260901000000_safe.sql",
    line: 1,
    signature: "public.safe",
    justification: SECURITY_DEFINER_JUSTIFICATION,
  };

  await assert.rejects(
    auditMigrations({ migrationDir, exceptions: [unused] }),
    /unused exception/iu,
  );
  await assert.rejects(
    auditMigrations({ migrationDir, exceptions: [unused, unused] }),
    /duplicate exception/iu,
  );
});

test("the canonical 49 migrations match the reviewed exception inventory", async () => {
  const config = JSON.parse(
    await readFile("infra/territorial/security-exceptions.json", "utf8"),
  );
  assert.equal(config.contractVersion, 1);

  const result = await auditMigrations({
    migrationDir: "infra/territorial/supabase/migrations",
    exceptions: config.exceptions,
  });

  assert.equal(result.passed, true);
  assert.equal(result.filesScanned, 49);
  assert.equal(result.errors.length, 0);
  assert.equal(result.exceptionsUsed.length, 19);
});
