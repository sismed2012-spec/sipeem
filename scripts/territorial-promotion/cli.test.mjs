import assert from "node:assert/strict";
import test from "node:test";

import { SOURCE_PROJECT_REF, TARGET_PROJECT_REF } from "./policy.mjs";
import { parsePromotionArgs, runPromotionCommand } from "./cli.mjs";

const MANIFEST_SHA = "a".repeat(64);

function manifest(overrides = {}) {
  return {
    manifestSha256: MANIFEST_SHA,
    source: { projectRef: SOURCE_PROJECT_REF },
    target: { projectRef: TARGET_PROJECT_REF },
    ...overrides,
  };
}

test("requires one explicit supported subcommand and manifest", () => {
  for (const argv of [
    [],
    ["preflight"],
    ["prod", "--manifest", "manifest.json"],
    ["retry", "--manifest", "manifest.json"],
    ["preflight", "--manifest", "manifest.json", "--unknown"],
    ["preflight", "--manifest", "manifest.json", "extra"],
  ]) {
    assert.throws(() => parsePromotionArgs(argv), /command|manifest|unknown|unexpected/iu);
  }
});

test("parses all seven commands and allows confirmation only for writes", () => {
  const commands = [
    "preflight",
    "schema-plan",
    "schema-apply",
    "data-plan",
    "data-apply",
    "verify",
    "status",
  ];
  for (const command of commands) {
    const args = [command, "--manifest", "manifest.json"];
    if (command.endsWith("-apply")) args.push("--confirm", "exact");
    const parsed = parsePromotionArgs(args);
    assert.equal(parsed.command, command);
    assert.equal(parsed.manifestPath, "manifest.json");
    assert.equal(parsed.confirmation, command.endsWith("-apply") ? "exact" : null);
  }
  assert.throws(
    () => parsePromotionArgs(["status", "--manifest", "manifest.json", "--confirm", "no"]),
    /confirmation.*write/iu,
  );
});

test("rejects arbitrary project references and incorrect confirmations", async () => {
  const base = {
    commands: { "schema-apply": async () => ({ status: "PASSED" }) },
  };
  await assert.rejects(
    runPromotionCommand({
      argv: ["schema-apply", "--manifest", "manifest.json", "--confirm", `${MANIFEST_SHA}:SCHEMA_APPLY`],
      dependencies: {
        ...base,
        loadManifest: async () => manifest({ target: { projectRef: "xvdqlozimvqluwxpbizx" } }),
      },
    }),
    /project/iu,
  );
  await assert.rejects(
    runPromotionCommand({
      argv: ["schema-apply", "--manifest", "manifest.json", "--confirm", "wrong"],
      dependencies: { ...base, loadManifest: async () => manifest() },
    }),
    /confirmation/iu,
  );
});

test("dispatches every command once and marks only apply commands writable", async () => {
  const seen = [];
  const commands = Object.fromEntries(
    ["preflight", "schema-plan", "schema-apply", "data-plan", "data-apply", "verify", "status"].map(
      (command) => [
        command,
        async (context) => {
          seen.push({ command, access: context.access });
          return { status: "PASSED", detail: "password=hunter2" };
        },
      ],
    ),
  );
  for (const command of Object.keys(commands)) {
    const argv = [command, "--manifest", "manifest.json"];
    if (command === "schema-apply") argv.push("--confirm", `${MANIFEST_SHA}:SCHEMA_APPLY`);
    if (command === "data-apply") argv.push("--confirm", `${MANIFEST_SHA}:DATA_APPLY`);
    const result = await runPromotionCommand({
      argv,
      dependencies: { loadManifest: async () => manifest(), commands },
    });
    assert.equal(result.exitCode, 0);
    assert.doesNotMatch(JSON.stringify(result.summary), /hunter2/iu);
  }
  assert.deepEqual(
    seen,
    Object.keys(commands).map((command) => ({
      command,
      access: command.endsWith("-apply") ? "write" : "read",
    })),
  );
});

test("status without a journal is BLOCKED with exit code 2", async () => {
  const result = await runPromotionCommand({
    argv: ["status", "--manifest", "manifest.json"],
    dependencies: {
      loadManifest: async () => manifest(),
      commands: {
        status: async () => ({ status: "BLOCKED", reason: "journal missing" }),
      },
    },
  });
  assert.equal(result.exitCode, 2);
  assert.equal(result.summary.status, "BLOCKED");
});

test("maps confirmed failure to 1 and does not expose a retry field", async () => {
  const result = await runPromotionCommand({
    argv: ["status", "--manifest", "manifest.json"],
    dependencies: {
      loadManifest: async () => manifest(),
      commands: {
        status: async () => ({ status: "FAILED_CONFIRMED", password: "secret" }),
      },
    },
  });
  assert.equal(result.exitCode, 1);
  assert.equal("retry" in result.summary, false);
  assert.doesNotMatch(JSON.stringify(result), /secret/iu);
});
