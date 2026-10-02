import assert from "node:assert/strict";
import test from "node:test";

import {
  composeRollbackSql,
  normalizeTransactionalSql,
  parseRollbackTestArgs,
} from "./sql-rollback-test.mjs";

const DEV = "nppvprbfmjbhwheghipa";

test("composeRollbackSql wraps files and rejects any commit", () => {
  assert.equal(
    composeRollbackSql(["create table x(id integer);", "select 1;"]),
    "begin;\ncreate table x(id integer);\nselect 1;\nrollback;\n"
  );
  assert.throws(
    () => composeRollbackSql(["create table x(id integer); commit;"]),
    /commit is forbidden/i
  );
});

test("normalizeTransactionalSql removes only a complete outer transaction", () => {
  assert.equal(
    normalizeTransactionalSql("begin;\nselect 1;\ncommit;\n"),
    "select 1;"
  );
  assert.equal(
    normalizeTransactionalSql("BEGIN;\nselect 2;\nROLLBACK;"),
    "select 2;"
  );
  assert.throws(
    () => normalizeTransactionalSql("select 1; commit;"),
    /complete outer transaction/i
  );
});

test("parseRollbackTestArgs pins DEV and requires SQL files", () => {
  assert.deepEqual(
    parseRollbackTestArgs([
      "--project-ref",
      DEV,
      "--strip-outer-transaction",
      "a.sql",
      "b.sql",
    ]),
    {
      projectRef: DEV,
      files: ["a.sql", "b.sql"],
      stripOuterTransaction: true,
    }
  );
  assert.throws(
    () => parseRollbackTestArgs(["--project-ref", "prod", "a.sql"]),
    /only SIPEEM-DEV is allowed/i
  );
  assert.throws(
    () => parseRollbackTestArgs(["--project-ref", DEV]),
    /at least one SQL file/i
  );
});
