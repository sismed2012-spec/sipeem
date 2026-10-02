import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { prepareCartographyArtifacts } from "./prepare.mjs";

const enabled = process.env.SIPEEM_CARTOGRAFIA_REAL_TEST === "1";

test("real INE packages reproduce the approved immutable territorial contract", {
  skip: !enabled,
  timeout: 120_000,
}, async () => {
  const mgsPath = process.env.SIPEEM_CARTOGRAFIA_MGS_ZIP;
  const bgdPath = process.env.SIPEEM_CARTOGRAFIA_BGD_ZIP;
  assert.ok(mgsPath, "SIPEEM_CARTOGRAFIA_MGS_ZIP is required");
  assert.ok(bgdPath, "SIPEEM_CARTOGRAFIA_BGD_ZIP is required");
  const artifactBase = await mkdtemp(path.join(tmpdir(), "sipeem-cartografia-real-"));
  try {
    const prepared = await prepareCartographyArtifacts({
      mgsPath,
      bgdPath,
      versionKey: "INE_EDOMEX_2026_PRE_RESECCIONAMIENTO",
      versionName: "INE Estado de México 2026 pre-reseccionamiento",
      expectedPublicationDate: "2026-09-12",
      artifactBase,
    });
    assert.equal(prepared.preflight.packages.MGS.sha256,
      "3f3023742be8d2e49594e5e201af002f0c0d4baacf3ebcf93b2d3f3ffc365a9b");
    assert.equal(prepared.preflight.packages.BGD.sha256,
      "fe9a1886a428a09fcd2514b3aff909a602384e36981f9ac1f510cac6f7c4c98d");
    assert.deepEqual(
      Object.fromEntries(Object.entries(prepared.preflight.layers).map(([name, item]) => [name, item.records])),
      {
        ENTIDAD: 1,
        MUNICIPIO: 125,
        DISTRITO_LOCAL: 45,
        DISTRITO_FEDERAL: 40,
        SECCION: 7052,
        COLONIA: 7367,
        LOCALIDAD: 3639,
        LIMITE_LOCALIDAD: 1826,
      },
    );
    assert.equal(prepared.preflight.database_compatibility.applyAllowedByCurrentSchema, true);
    assert.equal(prepared.plan.import.length, 88);
    const limits = JSON.parse(await readFile(
      path.join(prepared.root, "receipts", "locality-limits.json"), "utf8"));
    assert.equal(limits.relaciones_sha256,
      "0fbb44e5eeeb92b3140050221a4083e340a6e9e4c1cd403d6482f12e393ddc71");
    assert.equal(limits.limites_sin_punto_sha256,
      "35a851408c6500c5b032fca38ed676cd741c6c275be2523c668d7b9c534bf42b");
    assert.equal(limits.conteos.relaciones, 1384);
  } finally {
    await rm(artifactBase, { recursive: true, force: true });
  }
});
