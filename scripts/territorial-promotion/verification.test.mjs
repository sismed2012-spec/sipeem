import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createJournal, transitionJournal } from "./journal.mjs";
import { SOURCE_PROJECT_REF, TARGET_PROJECT_REF } from "./policy.mjs";
import { verifyPromotion } from "./verification.mjs";

const MANIFEST_SHA = "a".repeat(64);
const SOURCE_COMMIT = "b".repeat(40);
const EVIDENCE_SHA = "c".repeat(64);

function manifest() {
  return {
    manifestSha256: MANIFEST_SHA,
    sourceCommit: SOURCE_COMMIT,
    source: { projectRef: SOURCE_PROJECT_REF },
    target: { projectRef: TARGET_PROJECT_REF },
    expectations: {
      cartographyVersions: 2,
      sections: 7052,
      municipalities: 125,
      localDistricts: 45,
      federalDistricts: 40,
      ecegSections: 6544,
      nominalRows: 7191,
    },
    dataPolicy: {
      expectedSources: {
        demographic: [{ sha256: "d".repeat(64), state: "PUBLICADA" }],
        nominal: [{ sha256: "e".repeat(64), state: "PUBLICADO" }],
      },
      expectedGeometries: {
        srids: [4326],
        nullGeometries: 0,
        invalidGeometries: 0,
      },
      expectedCorrespondences: {
        eceg: { DIRECTA: 6544 },
        nominal: { VINCULADA: 7191 },
      },
    },
  };
}

function report() {
  const input = manifest();
  return {
    contractVersion: 1,
    kind: "promotion_postflight",
    counts: { ...input.expectations },
    sources: structuredClone(input.dataPolicy.expectedSources),
    geometries: structuredClone(input.dataPolicy.expectedGeometries),
    correspondences: structuredClone(input.dataPolicy.expectedCorrespondences),
    rpc: { missing: [] },
    security: {
      rlsViolations: [],
      privilegeViolations: [],
      functionViolations: [],
    },
    operationalObjects: [],
  };
}

function dataAppliedJournal() {
  let journal = createJournal({
    manifestSha256: MANIFEST_SHA,
    sourceCommit: SOURCE_COMMIT,
    sourceRef: SOURCE_PROJECT_REF,
    targetRef: TARGET_PROJECT_REF,
  });
  for (const to of [
    "PREFLIGHT_PASSED",
    "SCHEMA_APPLYING",
    "SCHEMA_APPLIED",
    "DATA_APPLYING",
    "DATA_APPLIED",
  ]) {
    journal = transitionJournal(journal, { to, evidenceSha256: EVIDENCE_SHA });
  }
  return journal;
}

function dependencies(value = report(), advisors = { securityCritical: 0, performanceCritical: 0 }) {
  const persisted = [];
  return {
    persisted,
    queryProject: async () => ({ exitCode: 0, stdout: JSON.stringify(value), stderr: "" }),
    queryAdvisors: async () => advisors,
    persistJournal: async (journal) => persisted.push(structuredClone(journal)),
  };
}

test("verifies every exact postflight criterion and advances the journal", async () => {
  const deps = dependencies();
  const result = await verifyPromotion({
    manifest: manifest(),
    projectRef: TARGET_PROJECT_REF,
    journal: dataAppliedJournal(),
    dependencies: deps,
  });

  assert.equal(result.status, "PASSED");
  assert.equal(result.journal.state, "VERIFIED");
  assert.deepEqual(deps.persisted.map(({ state }) => state), ["VERIFYING", "VERIFIED"]);
  assert.match(result.evidenceSha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(result.issues, []);
});

test("blocks every mismatch without tolerance", async () => {
  const variants = [
    { counts: { ...report().counts, sections: 7051 } },
    { sources: { ...report().sources, nominal: [{ sha256: "f".repeat(64), state: "PUBLICADO" }] } },
    { geometries: { ...report().geometries, invalidGeometries: 1 } },
    { correspondences: { ...report().correspondences, nominal: { VINCULADA: 7190 } } },
    { rpc: { missing: ["public.rpc_get_seccion"] } },
    { security: { ...report().security, rlsViolations: ["public.bad"] } },
    { operationalObjects: ["public.usuarios"] },
  ];
  for (const override of variants) {
    const deps = dependencies({ ...report(), ...override });
    const result = await verifyPromotion({
      manifest: manifest(),
      projectRef: TARGET_PROJECT_REF,
      journal: dataAppliedJournal(),
      dependencies: deps,
    });
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.journal.state, "BLOCKED");
    assert.ok(result.issues.length > 0);
  }
});

test("blocks critical Supabase advisors and probe failures", async () => {
  const critical = dependencies(report(), { securityCritical: 1, performanceCritical: 0 });
  const blocked = await verifyPromotion({
    manifest: manifest(),
    projectRef: TARGET_PROJECT_REF,
    journal: dataAppliedJournal(),
    dependencies: critical,
  });
  assert.equal(blocked.status, "BLOCKED");
  assert.ok(blocked.issues.some(({ code }) => code === "ADVISOR_FINDING"));

  const failed = dependencies();
  failed.queryProject = async () => ({ exitCode: 1, stdout: "", stderr: "password=hunter2" });
  const failure = await verifyPromotion({
    manifest: manifest(),
    projectRef: TARGET_PROJECT_REF,
    journal: dataAppliedJournal(),
    dependencies: failed,
  });
  assert.equal(failure.status, "BLOCKED");
  assert.doesNotMatch(JSON.stringify(failure), /hunter2/iu);
});

test("ships a single read-only integral postflight", async () => {
  const sql = await readFile(
    "infra/territorial/supabase/tests/promotion_postflight.sql",
    "utf8",
  );
  assert.match(sql, /^\s*(?:with\b|select\b)/iu);
  assert.doesNotMatch(
    sql.replace(/--.*$/gmu, ""),
    /\b(?:insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|call|do|copy)\b/iu,
  );
  assert.equal((sql.match(/;\s*(?=\s*$)/gu) ?? []).length, 1);
  for (const signal of [
    "territorios_secciones",
    "demografia_eceg_secciones",
    "lista_nominal_secciones",
    "st_srid",
    "correspondencias",
    "rpc_",
    "relrowsecurity",
    "privilege",
    "operational",
    "advisor",
  ]) {
    assert.match(sql.toLowerCase(), new RegExp(signal, "u"));
  }
  for (const signature of [
    "public.rpc_lista_nominal_seccion(bigint,bigint,date)",
    "public.rpc_indicadores_territoriales(text,bigint,bigint,bigint)",
  ]) {
    assert.match(sql, new RegExp(signature.replace(/[().]/gu, "\\$&"), "u"));
  }
});
