import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SOURCE_PROJECT_REF,
  TARGET_PROJECT_REF,
  assertProjectRole,
  assertSafeOperation,
  buildSupabaseInvocation,
} from "./policy.mjs";

const MAIN_PROJECT_REF = "xvdqlozimvqluwxpbizx";
const PREVIEW_PROJECT_REF = "ljlfezcpckrmbrmucbva";

test("allows exact source reads and exact target reads or writes", () => {
  assert.doesNotThrow(() =>
    assertProjectRole({
      projectRef: SOURCE_PROJECT_REF,
      role: "source",
      access: "read",
    }),
  );
  for (const access of ["read", "write"]) {
    assert.doesNotThrow(() =>
      assertProjectRole({
        projectRef: TARGET_PROJECT_REF,
        role: "target",
        access,
      }),
    );
  }
});

test("rejects source writes and every non-exact project reference", () => {
  assert.throws(
    () =>
      assertProjectRole({
        projectRef: SOURCE_PROJECT_REF,
        role: "source",
        access: "write",
      }),
    /source.*read-only/i,
  );

  for (const projectRef of [
    MAIN_PROJECT_REF,
    PREVIEW_PROJECT_REF,
    "unknown",
    ` ${TARGET_PROJECT_REF}`,
    TARGET_PROJECT_REF.toUpperCase(),
    `${TARGET_PROJECT_REF}-suffix`,
  ]) {
    assert.throws(
      () =>
        assertProjectRole({ projectRef, role: "target", access: "write" }),
      /project reference|permanently denied/i,
    );
  }
});

test("accepts only phase-appropriate read and write operations", () => {
  assert.doesNotThrow(() =>
    assertSafeOperation({
      phase: "preflight",
      projectRef: SOURCE_PROJECT_REF,
      args: ["db", "query", "--file", "probe.sql"],
    }),
  );
  assert.doesNotThrow(() =>
    assertSafeOperation({
      phase: "schema-plan",
      projectRef: TARGET_PROJECT_REF,
      args: ["db", "push", "--dry-run", "--skip-vault"],
    }),
  );
  assert.doesNotThrow(() =>
    assertSafeOperation({
      phase: "schema-apply",
      projectRef: TARGET_PROJECT_REF,
      args: ["db", "push", "--skip-vault"],
    }),
  );
  assert.throws(
    () =>
      assertSafeOperation({
        phase: "schema-apply",
        projectRef: SOURCE_PROJECT_REF,
        args: ["db", "push", "--skip-vault"],
      }),
    /source.*read-only/i,
  );
});

test("rejects destructive, seeded, URL-based, and credential-bearing arguments", () => {
  const forbiddenArgumentSets = [
    ["db", "reset"],
    ["db", "push", "--include-seed"],
    ["db", "push", "--include-seed=true"],
    ["db", "push", "--db-url", "postgresql://postgres@db.invalid/db"],
    ["db", "push", "--db-url=postgresql://postgres@db.invalid/db"],
    ["db", "query", "password=hunter2"],
    ["db", "query", "--token", "secret"],
    ["db", "query", "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature"],
    ["db", "query", "sb_secret_example"],
  ];

  for (const args of forbiddenArgumentSets) {
    assert.throws(
      () =>
        assertSafeOperation({
          phase: "preflight",
          projectRef: TARGET_PROJECT_REF,
          args,
        }),
      /forbidden|credential|secret/i,
    );
  }
});

test("builds a shell-free npm CLI invocation with the territorial workdir", () => {
  const invocation = buildSupabaseInvocation({
    args: ["db", "query", "--file", "probe.sql"],
    projectRef: SOURCE_PROJECT_REF,
    workdir: "infra/territorial",
    platform: "win32",
    execPath: "C:\\node\\node.exe",
    npmExecPath: "C:\\node\\npm-cli.js",
  });

  assert.deepEqual(invocation, {
    command: "C:\\node\\node.exe",
    args: [
      "C:\\node\\npm-cli.js",
      "exec",
      "supabase",
      "--",
      "--workdir",
      "infra/territorial",
      "db",
      "query",
      "--file",
      "probe.sql",
      "--project-ref",
      SOURCE_PROJECT_REF,
    ],
  });
  for (const override of ["--project-ref=unknown", "--workdir=elsewhere"]) {
    assert.throws(
      () =>
        buildSupabaseInvocation({
          args: ["db", "query", override],
          projectRef: SOURCE_PROJECT_REF,
        }),
      /overrides are forbidden/i,
    );
  }
});
