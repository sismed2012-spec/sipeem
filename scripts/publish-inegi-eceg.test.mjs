import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEcegPublishSql,
  parseEcegPublishArgs,
  runEcegPublish,
} from "./publish-inegi-eceg.mjs";

const DEV = "nppvprbfmjbhwheghipa";

test("parseEcegPublishArgs defaults to dry-run and accepts only SIPEEM-DEV", () => {
  assert.deepEqual(parseEcegPublishArgs(["--project-ref", DEV]), {
    projectRef: DEV,
    apply: false,
  });
  assert.equal(
    parseEcegPublishArgs(["--project-ref", DEV, "--apply"]).apply,
    true
  );
  assert.throws(
    () => parseEcegPublishArgs(["--project-ref", "prod", "--apply"]),
    /only SIPEEM-DEV is allowed/i
  );
  assert.throws(
    () => parseEcegPublishArgs(["--project-ref", DEV, "--force"]),
    /unknown argument/i
  );
});

test("buildEcegPublishSql binds the database guard in one transaction", () => {
  const sql = buildEcegPublishSql("do $x$ begin null; end $x$;", DEV);

  assert.match(sql, /^begin;/i);
  assert.match(
    sql,
    /set_config\(\s*'sipeem\.project_ref',\s*'nppvprbfmjbhwheghipa',\s*true\s*\)/i
  );
  assert.match(sql, /do \$x\$/i);
  assert.match(sql, /commit;\s*$/i);
});

test("runEcegPublish is dry-run by default and executes exactly once on apply", async () => {
  let reads = 0;
  const calls = [];
  const dependencies = {
    readSql: async () => {
      reads += 1;
      return "do $x$ begin null; end $x$;";
    },
    runCommand: async (command, args) => {
      calls.push({ command, args });
      return { exitCode: 0, stdout: "ok", stderr: "" };
    },
  };

  const dryRun = await runEcegPublish({ projectRef: DEV, apply: false }, dependencies);
  assert.equal(dryRun.mode, "dry-run");
  assert.equal(reads, 0);
  assert.equal(calls.length, 0);

  const applied = await runEcegPublish({ projectRef: DEV, apply: true }, dependencies);
  assert.equal(applied.mode, "apply");
  assert.equal(reads, 1);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].args.includes(DEV));
  assert.match(calls[0].args.at(-1), /sipeem\.project_ref/);
});

test("runEcegPublish reports one failure without retrying", async () => {
  let calls = 0;
  await assert.rejects(
    () => runEcegPublish(
      { projectRef: DEV, apply: true },
      {
        readSql: async () => "do $x$ begin null; end $x$;",
        runCommand: async () => {
          calls += 1;
          return { exitCode: 1, stdout: "", stderr: "blocked" };
        },
      }
    ),
    /publication failed.*no automatic retry/i
  );
  assert.equal(calls, 1);
});
