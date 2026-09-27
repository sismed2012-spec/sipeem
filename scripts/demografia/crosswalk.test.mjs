import assert from "node:assert/strict";
import test from "node:test";

import { hashRecord } from "./iter-parser.mjs";

import {
  buildCrosswalkBatch,
  classifyCrosswalk,
  normalizeName,
  rankCandidates,
} from "./crosswalk.mjs";

const VERSION = 4025;

function source(overrides = {}) {
  return {
    name: "San José del Rincón",
    longitude: -100.154,
    latitude: 19.641,
    cartographyVersionId: VERSION,
    ...overrides,
  };
}

function candidate(overrides = {}) {
  return {
    candidateId: 2001,
    boundaryId: 3001,
    cartographyVersionId: VERSION,
    name: "San Jose del Rincon",
    distanceMeters: 12,
    municipalityContains: true,
    sourceCode: "0001",
    candidateCode: "0001",
    sectionCandidates: [
      { cartographySectionId: 1001, sectionId: 101, contact: "AREA", strictCoverage: true },
    ],
    ...overrides,
  };
}

test("normalizeName removes accents and punctuation deterministically", () => {
  assert.equal(normalizeName("  San José-del Rincón, Méx. "), "san jose del rincon mex");
});

test("strict municipality, name, proximity and one covered section classify DIRECTA", () => {
  const result = classifyCrosswalk(source(), [candidate()]);

  assert.equal(result.status, "DIRECTA");
  assert.equal(result.selectedBoundaryId, 3001);
  assert.equal(result.selectedSectionId, 101);
  assert.deepEqual(result.evidence.sourcePoint, [-100.154, 19.641]);
  assert.deepEqual(result.evidence.candidateIds, [2001]);
});

test("a boundary intersecting or touching two sections classifies MULTISECCION", () => {
  for (const contact of ["AREA", "BORDE"]) {
    const result = classifyCrosswalk(source(), [candidate({
      sectionCandidates: [
        { cartographySectionId: 1001, sectionId: 101, contact: "AREA", strictCoverage: false },
        { cartographySectionId: 1002, sectionId: 102, contact, strictCoverage: false },
      ],
    })]);
    assert.equal(result.status, "MULTISECCION");
    assert.equal(result.selectedSectionId, null);
  }
});

test("a point in one section does not override a boundary crossing another", () => {
  const result = classifyCrosswalk(source(), [candidate({
    pointSectionId: 101,
    sectionCandidates: [
      { cartographySectionId: 1001, sectionId: 101, contact: "AREA", strictCoverage: false },
      { cartographySectionId: 1002, sectionId: 102, contact: "AREA", strictCoverage: false },
    ],
  })]);

  assert.equal(result.status, "MULTISECCION");
  assert.equal(result.evidence.pointSectionId, 101);
  assert.equal(result.evidence.intersectionCount, 2);
});

test("conflicting candidates inside the ambiguity threshold require manual review", () => {
  const result = classifyCrosswalk(source(), [
    candidate({ candidateId: 2001, boundaryId: 3001, distanceMeters: 20 }),
    candidate({ candidateId: 2002, boundaryId: 3002, distanceMeters: 21 }),
  ]);

  assert.equal(result.status, "REVISION_MANUAL");
  assert.equal(result.evidence.ambiguous, true);
  assert.deepEqual(result.evidence.candidateIds, [2001, 2002]);
});

test("no locality boundary match remains SIN_CORRESPONDENCIA", () => {
  const result = classifyCrosswalk(source(), [candidate({ boundaryId: null })]);
  assert.equal(result.status, "SIN_CORRESPONDENCIA");
});

test("matching INE and INEGI codes never defeat conflicting spatial or name evidence", () => {
  const result = classifyCrosswalk(source(), [candidate({
    name: "Nombre totalmente distinto",
    municipalityContains: false,
    sourceCode: "0001",
    candidateCode: "0001",
  })]);
  assert.notEqual(result.status, "DIRECTA");
});

test("candidate ranking is scoped to the requested cartography version", () => {
  const ranked = rankCandidates(source(), [
    candidate({ candidateId: 1999, cartographyVersionId: VERSION - 1, distanceMeters: 1 }),
    candidate({ candidateId: 2001, cartographyVersionId: VERSION, distanceMeters: 12 }),
  ]);

  assert.deepEqual(ranked.map(({ candidateId }) => candidateId), [2001]);
});

test("generated PostGIS SQL uses longitude before latitude and persists all signals", () => {
  const batch = buildCrosswalkBatch({
    sourceHash: "a".repeat(64),
    cartographyVersionId: VERSION,
  });

  assert.equal(batch.checksum, hashRecord({ descriptor: batch.descriptor, sql: batch.sql }));
  assert.match(batch.sql, /st_makepoint\(d\.longitud::double precision, d\.latitud::double precision\)/i);
  assert.match(batch.sql, /m\.cartografia_version_id = 4025/i);
  assert.match(batch.sql, /l\.cartografia_version_id = 4025/i);
  assert.match(batch.sql, /s\.cartografia_version_id = 4025/i);
  assert.match(batch.sql, /st_covers\(m\.geom, src\.source_point\)/i);
  assert.match(batch.sql, /st_intersects\(chosen\.geom, s\.geom\)/i);
  assert.match(batch.sql, /st_coveredby\(chosen\.geom, s\.geom\)/i);
  assert.match(batch.sql, /distancia_metros/i);
  assert.match(batch.sql, /similitud_nombre/i);
  assert.match(batch.sql, /candidateIds|candidate_ids/i);
  assert.match(batch.sql, /greatest\(0::double precision,/i);
  assert.match(batch.sql, /named_candidates as[\s\S]*eligible_name_candidates as/i);
  assert.match(batch.sql, /eligible_name_candidates[\s\S]*where named\.similitud_nombre >= 0\.72/i);
  assert.ok(
    batch.sql.indexOf("where named.similitud_nombre >= 0.72")
      < batch.sql.indexOf("extensions.st_distance(named.source_point"),
    "name eligibility must be applied before expensive geography distance calculations"
  );
  assert.doesNotMatch(batch.sql, /pg_catalog\.greatest/i);
  assert.doesNotMatch(batch.sql, /proporcion_localidad\s*>\s*0\s*and\s*estado\s*=\s*'DIRECTA'/i);
});
