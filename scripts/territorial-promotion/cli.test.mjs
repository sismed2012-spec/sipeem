import assert from "node:assert/strict";
import test from "node:test";

import { SOURCE_PROJECT_REF, TARGET_PROJECT_REF } from "./policy.mjs";
import {
  buildNativeAdvisorInvocation,
  classifyDataRestoreProbe,
  parsePromotionArgs,
  resolveFrozenDataPolicy,
  runPromotionCommand,
  runtimePaths,
} from "./cli.mjs";

const MANIFEST_SHA = "a".repeat(64);

function manifest(overrides = {}) {
  return {
    contractVersion: 1,
    manifestSha256: MANIFEST_SHA,
    source: { projectRef: SOURCE_PROJECT_REF },
    target: { projectRef: TARGET_PROJECT_REF },
    ...overrides,
  };
}

function recoveryManifest(overrides = {}) {
  return manifest({
    contractVersion: 2,
    mode: "DATA_RECOVERY",
    recovery: { predecessorManifestSha256: "b".repeat(64) },
    ...overrides,
  });
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

test("parses all legacy and recovery commands and allows confirmation only for writes", () => {
  const commands = [
    "preflight",
    "recovery-preflight",
    "schema-plan",
    "schema-apply",
    "schema-adopt",
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

test("dispatches every legacy command once and marks only apply commands writable", async () => {
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

test("routes recovery commands with data-apply as the only remote write", async () => {
  const seen = [];
  const names = ["recovery-preflight", "schema-adopt", "data-plan", "data-apply", "verify", "status"];
  const commands = Object.fromEntries(names.map((command) => [
    command,
    async (context) => {
      seen.push({ command, access: context.access });
      return { status: "PASSED" };
    },
  ]));
  for (const command of names) {
    const argv = [command, "--manifest", "recovery.json"];
    if (command === "data-apply") argv.push("--confirm", `${MANIFEST_SHA}:DATA_APPLY`);
    const result = await runPromotionCommand({
      argv,
      dependencies: { loadManifest: async () => recoveryManifest(), commands },
    });
    assert.equal(result.exitCode, 0);
  }
  assert.deepEqual(seen, names.map((command) => ({
    command,
    access: command === "data-apply" ? "write" : "read",
  })));
});

test("keeps legacy and recovery command paths mutually exclusive", async () => {
  for (const command of ["recovery-preflight", "schema-adopt"]) {
    await assert.rejects(
      runPromotionCommand({
        argv: [command, "--manifest", "legacy.json"],
        dependencies: { loadManifest: async () => manifest(), commands: { [command]: async () => ({}) } },
      }),
      /contract|recovery|command/iu,
    );
  }
  for (const command of ["preflight", "schema-plan", "schema-apply"]) {
    const argv = [command, "--manifest", "recovery.json"];
    if (command === "schema-apply") argv.push("--confirm", `${MANIFEST_SHA}:SCHEMA_APPLY`);
    await assert.rejects(
      runPromotionCommand({
        argv,
        dependencies: { loadManifest: async () => recoveryManifest(), commands: { [command]: async () => ({}) } },
      }),
      /contract|recovery|command/iu,
    );
  }
  assert.throws(() => parsePromotionArgs(["retry", "--manifest", "recovery.json"]), /unknown/iu);
});

test("namespaces every recovery runtime file by the new manifest hash", () => {
  const value = recoveryManifest();
  const paths = runtimePaths("C:\\repo", value);
  for (const filePath of Object.values(paths)) {
    assert.match(filePath, new RegExp(MANIFEST_SHA, "u"));
    assert.doesNotMatch(filePath, new RegExp(value.recovery.predecessorManifestSha256, "u"));
  }
  assert.match(paths.failureEvidence, /failure\.json$/u);
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

test("binds recovery data planning to the immutable recovery policy", async () => {
  const currentPolicy = { contractVersion: 3, marker: "mutable" };
  const recovery = recoveryManifest({ dataPolicy: currentPolicy });
  const resolved = await resolveFrozenDataPolicy(recovery, async () => {
    throw new Error("must not load predecessor");
  });
  assert.equal(resolved, currentPolicy);
  assert.equal(await resolveFrozenDataPolicy(manifest({ dataPolicy: currentPolicy }), async () => {
    throw new Error("must not load predecessor");
  }), currentPolicy);
});

test("classifies interrupted data restores from an exact read-only postflight", () => {
  const expectations = { sections: 7052, municipalities: 125 };
  const expectedDataPolicy = {
    expectedSources: { demographic: [], nominal: [] },
    expectedGeometries: { srids: [4326], nullGeometries: 0, invalidGeometries: 0 },
    expectedCorrespondences: { eceg: {}, nominal: {} },
  };
  const report = {
    contractVersion: 1,
    kind: "promotion_postflight",
    counts: expectations,
    sources: expectedDataPolicy.expectedSources,
    geometries: expectedDataPolicy.expectedGeometries,
    correspondences: expectedDataPolicy.expectedCorrespondences,
    rpc: { missing: [] },
    security: { rlsViolations: [], privilegeViolations: [], functionViolations: [] },
    operationalObjects: [],
    traceability: { orphanedResultadoStagingReferences: 0, nonNullResultadoStagingReferences: 0 },
  };
  const complete = classifyDataRestoreProbe({
    report,
    expectations,
    expectedDataPolicy,
  });
  const partial = classifyDataRestoreProbe({
    report: { ...report, counts: { ...expectations, sections: 7000 } },
    expectations,
    expectedDataPolicy,
  });
  const orphaned = classifyDataRestoreProbe({
    report: { ...report, traceability: { ...report.traceability, orphanedResultadoStagingReferences: 1 } },
    expectations,
    expectedDataPolicy,
  });
  assert.equal(complete.status, "COMPLETE");
  assert.equal(partial.status, "PARTIAL");
  assert.equal(orphaned.status, "PARTIAL");
  assert.match(complete.evidenceSha256, /^[a-f0-9]{64}$/u);
});

test("classifies a rolled-back data restore only from the exact empty canonical set", () => {
  const expectations = { sections: 7052, municipalities: 125 };
  const expectedDataPolicy = {
    include: [{ table: "public.territorios_secciones" }, { table: "public.territorios_municipios" }],
    expectedSources: { demographic: [], nominal: [] },
    expectedGeometries: { srids: [4326], nullGeometries: 0, invalidGeometries: 0 },
    expectedCorrespondences: { eceg: {}, nominal: {} },
  };
  const partialPostflight = {
    contractVersion: 1,
    kind: "promotion_postflight",
    counts: { ...expectations, sections: 0, municipalities: 0 },
    sources: expectedDataPolicy.expectedSources,
    geometries: expectedDataPolicy.expectedGeometries,
    correspondences: expectedDataPolicy.expectedCorrespondences,
    rpc: { missing: [] },
    security: { rlsViolations: [], privilegeViolations: [], functionViolations: [] },
    operationalObjects: [],
    traceability: { orphanedResultadoStagingReferences: 0, nonNullResultadoStagingReferences: 0 },
  };
  const exactAbsence = {
    contractVersion: 1,
    kind: "promotion_recovery_absence",
    tables: [
      { table: "public.territorios_municipios", rowCount: 0 },
      { table: "public.territorios_secciones", rowCount: 0 },
    ],
  };

  const absent = classifyDataRestoreProbe({
    report: partialPostflight,
    absenceReport: exactAbsence,
    expectations,
    expectedDataPolicy,
  });
  const partial = classifyDataRestoreProbe({
    report: partialPostflight,
    absenceReport: {
      ...exactAbsence,
      tables: exactAbsence.tables.map((row, index) => ({ ...row, rowCount: index === 0 ? 1 : 0 })),
    },
    expectations,
    expectedDataPolicy,
  });

  assert.equal(absent.status, "ABSENT");
  assert.equal(partial.status, "PARTIAL");
  assert.match(absent.evidenceSha256, /^[a-f0-9]{64}$/u);
});

test("pins native advisors to the territorial workdir and exact target", () => {
  const invocation = buildNativeAdvisorInvocation(TARGET_PROJECT_REF);
  assert.ok(invocation.args.includes("--workdir"));
  assert.ok(invocation.args.includes("infra/territorial"));
  assert.equal(invocation.args.filter((value) => value === "--project-ref").length, 1);
  assert.ok(invocation.args.includes(TARGET_PROJECT_REF));
  assert.ok(invocation.args.includes("advisors"));
  assert.ok(invocation.args.includes("--linked"));
});
