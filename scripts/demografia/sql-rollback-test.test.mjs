import assert from "node:assert/strict";
import test from "node:test";

import {
  composeRollbackSql,
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

test("parseRollbackTestArgs pins DEV and requires SQL files", () => {
  assert.deepEqual(
    parseRollbackTestArgs(["--project-ref", DEV, "a.sql", "b.sql"]),
    { projectRef: DEV, files: ["a.sql", "b.sql"] }
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
