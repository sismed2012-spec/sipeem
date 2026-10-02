import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { hashRecord } from "./iter-parser.mjs";
import {
  aggregateSections,
  buildAggregateBatch,
  buildQualityReport,
  writeQualityReport,
} from "./aggregate.mjs";

const SOURCE_HASH = "a".repeat(64);

const localities = [
  { id: 1, municipality: "001", pobtot: 100, pobfem: 60, p15ymas: 80, graproes: 8 },
  { id: 2, municipality: "001", pobtot: 50, pobfem: null, p15ymas: 40, graproes: 10 },
  { id: 3, municipality: "001", pobtot: 70, pobfem: 35, p15ymas: 50, graproes: 9 },
  { id: 4, municipality: "002", pobtot: 30, pobfem: 15, p15ymas: 20, graproes: 7 },
  { id: 5, municipality: "002", pobtot: 20, pobfem: 10, p15ymas: 10, graproes: 6 },
  { id: 6, municipality: "002", pobtot: null, pobfem: 5, p15ymas: null, graproes: null },
];

const correspondences = [
  { localityId: 1, status: "DIRECTA", cartographySectionId: 1001, sectionId: 101, confidence: 0.98 },
  { localityId: 2, status: "DIRECTA", cartographySectionId: 1001, sectionId: 101, confidence: 0.97 },
  { localityId: 3, status: "MULTISECCION", candidateSections: [
    { cartographySectionId: 1001, sectionId: 101 },
    { cartographySectionId: 1002, sectionId: 102 },
  ] },
  { localityId: 4, status: "REVISION_MANUAL", candidateSections: [
    { cartographySectionId: 1003, sectionId: 103 },
  ] },
  { localityId: 5, status: "SIN_CORRESPONDENCIA", candidateSections: [] },
  { localityId: 6, status: "DIRECTA", cartographySectionId: 1002, sectionId: 102, confidence: 0.9 },
];

function materialize(version = 4025) {
  return aggregateSections({
    sourceHash: SOURCE_HASH,
    cartographyVersionId: version,
    localities,
    correspondences,
  });
}

test("only DIRECTA localities contribute once and reserved values stay absent", () => {
  const result = materialize();
  const section101 = result.sections.find(({ sectionId }) => sectionId === 101);
  const section102 = result.sections.find(({ sectionId }) => sectionId === 102);
  const section103 = result.sections.find(({ sectionId }) => sectionId === 103);

  assert.equal(section101.localitiesIncluded, 2);
  assert.equal(section101.pobtot, 150);
  assert.equal(section101.pobfem, 60);
  assert.equal(section101.pendingLocalities, 1);
  assert.equal(section102.localitiesIncluded, 1);
  assert.equal(section102.pobtot, null);
  assert.equal(section102.pobfem, 5);
  assert.equal(section103.localitiesIncluded, 0);
  assert.equal(section103.pobtot, null);
  assert.equal(section103.pendingLocalities, 1);
  assert.equal(result.invariants.aggregatePopulationAtMostIncluded, true);
  assert.equal(result.invariants.directLocalitiesCountedOnce, true);
});

test("GRAPROES is weighted only by non-reserved P15YMAS", () => {
  const section = materialize().sections.find(({ sectionId }) => sectionId === 101);
  assert.equal(section.graproes, (8 * 80 + 10 * 40) / 120);
});

test("pending population and coverage remain null without a defensible denominator", () => {
  for (const section of materialize().sections) {
    assert.equal(section.pendingPopulationReference, null);
    assert.equal(section.coveragePercentage, null);
    assert.equal(section.coverageReason, "SIN_DENOMINADOR_SECCIONAL_DEFENDIBLE");
  }
});

test("recomputation is deterministic and cartography versions remain separate", () => {
  assert.deepEqual(materialize(), materialize());
  assert.notDeepEqual(materialize(4025).sections, materialize(4026).sections);
  assert.equal(materialize(4026).sections[0].cartographyVersionId, 4026);
});

test("duplicate locality correspondences are rejected before arithmetic", () => {
  assert.throws(
    () => aggregateSections({
      sourceHash: SOURCE_HASH,
      cartographyVersionId: 4025,
      localities,
      correspondences: [...correspondences, correspondences[0]],
    }),
    /locality 1.*more than once/i
  );
});

test("aggregate SQL replaces only one source/version and validates strict invariants", () => {
  const batch = buildAggregateBatch({ sourceHash: SOURCE_HASH, cartographyVersionId: 4025 });

  assert.equal(batch.checksum, hashRecord({ descriptor: batch.descriptor, sql: batch.sql }));
  assert.match(batch.sql, /^begin;/i);
  assert.match(batch.sql, /c\.estado = 'DIRECTA'/i);
  assert.match(batch.sql, /d\.indicadores ->> 'P15YMAS'/i);
  assert.match(batch.sql, /delete from public\.demografia_secciones[\s\S]*cartografia_version_id = 4025/i);
  assert.match(batch.sql, /SIN_DENOMINADOR_SECCIONAL_DEFENDIBLE/);
  assert.match(batch.sql, /estado = 'VALIDADA'/i);
  assert.match(batch.sql, /aggregate population exceeds included source population/i);
  assert.doesNotMatch(batch.sql, /poblacion_pendiente_referencia[\s\S]{0,80}sum\(/i);
  assert.match(batch.sql, /commit;\s*$/i);
});

test("quality report records reconciliation, statuses, sections and checksums", async () => {
  const materialization = materialize();
  const report = buildQualityReport({
    source: { hash: SOURCE_HASH, rows: 5136, localities: 4894, population: 16992418 },
    cartographyVersionId: 4025,
    localities,
    correspondences,
    materialization,
    inputChecksums: { source: SOURCE_HASH, crosswalk: "b".repeat(64) },
    outputChecksums: { aggregate: "c".repeat(64) },
  });
  const root = await mkdtemp(path.join(os.tmpdir(), "sipeem-demografia-quality-"));
  const paths = await writeQualityReport(report, root);
  const json = JSON.parse(await readFile(paths.jsonPath, "utf8"));
  const markdown = await readFile(paths.markdownPath, "utf8");

  assert.equal(json.source.reconciled, true);
  assert.deepEqual(json.statuses.counts, {
    DIRECTA: 3,
    MULTISECCION: 1,
    REVISION_MANUAL: 1,
    SIN_CORRESPONDENCIA: 1,
  });
  assert.equal(json.invariants.aggregatePopulationAtMostIncluded, true);
  assert.equal(json.cartographyVersionId, 4025);
  assert.match(markdown, /Quality report/i);
  assert.match(markdown, /MULTISECCION\s*\|\s*1/i);
  assert.match(markdown, /SIN_DENOMINADOR_SECCIONAL_DEFENDIBLE/);
});
