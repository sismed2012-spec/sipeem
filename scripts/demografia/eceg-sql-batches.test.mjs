import assert from "node:assert/strict";
import test from "node:test";

import {
  ECEG_CORE_INDICATOR_IDS,
  assertEcegCoreIndicators,
  buildEcegCorrespondenceBatches,
  buildEcegIndicatorBatches,
  buildEcegSectionBatches,
  buildEcegSourceBatch,
  normalizeEcegSection,
} from "./eceg-sql-batches.mjs";

const sourceHash = "a".repeat(64);

function parsedSection(index, overrides = {}) {
  const sectionNumber = String(index).padStart(4, "0");
  return {
    geography: {
      entityCode: "15",
      entityName: "México",
      district: "001",
      complexityGroup: "Disperso 1",
      municipalityCode: "001",
      municipalityName: "Acambay",
      sectionNumber,
    },
    rowNumbers: { Población: index + 4, Vivienda: index + 4 },
    recordHash: String(index).padStart(64, "0").slice(-64),
    indicators: {
      poblacion_poblacion_total: { value: index, status: "PRESENTE" },
      poblacion_poblacion_femenina: { value: null, status: "AUSENTE" },
      educacion_grado_promedio_de_escolaridad: { value: 9.5, status: "PRESENTE" },
      vivienda_viviendas_particulares_habitadas_que_disponen_de_internet: {
        value: 0,
        status: "PRESENTE",
      },
      ...overrides,
    },
  };
}

test("buildEcegSourceBatch is deterministic and hides source metadata in base64", () => {
  const profile = {
    sourceHash,
    zipHash: "b".repeat(64),
    fileName: "ECEG_Distritos_Secciones_Nacional.xlsx",
    sectionCount: 6544,
    indicatorCount: 220,
    sheetSchemas: { Población: { indicatorCount: 49 } },
  };
  const first = buildEcegSourceBatch(profile);
  const second = buildEcegSourceBatch(profile);

  assert.equal(first.checksum, second.checksum);
  assert.equal(first.sql, second.sql);
  assert.match(first.sql, /CPV2020_ECEG/);
  assert.match(first.sql, /decode\('[A-Za-z0-9+/=]+', 'base64'\)/);
  assert.doesNotMatch(first.sql, /ECEG_Distritos_Secciones_Nacional\.xlsx/);
});

test("buildEcegIndicatorBatches emits the 220-item dictionary deterministically", () => {
  const indicators = Array.from({ length: 220 }, (_, index) => ({
    id: index === 0
      ? "fecundidad_promedio_de_hijas_e_hijos_nacidos_vivos"
      : `poblacion_indicador_${index}`,
    theme: index === 0 ? "Fecundidad" : "Población",
    officialHeader: index === 0
      ? "Promedio de hijas e hijos nacidos vivos"
      : `Indicador ${index}`,
    order: index,
  }));

  const batches = buildEcegIndicatorBatches(indicators, { sourceHash });

  assert.equal(batches.length, 1);
  assert.equal(batches[0].expectedRows, 220);
  assert.match(batches[0].sql, /demografia_indicadores/);
  assert.match(batches[0].sql, /CPV2020_ECEG/);
  assert.doesNotMatch(batches[0].sql, /Promedio de hijas/);
});

test("normalizeEcegSection maps summary fields and preserves null states", () => {
  const normalized = normalizeEcegSection(parsedSection(1));

  assert.equal(normalized.numero_seccion, "0001");
  assert.equal(normalized.pobtot, 1);
  assert.equal(normalized.pobfem, null);
  assert.equal(normalized.graproes, 9.5);
  assert.equal(normalized.vph_inter, 0);
  assert.equal(
    normalized.estados_dato.POBLACION_POBLACION_FEMENINA,
    "AUSENTE"
  );
  assert.equal(normalized.indicadores.POBLACION_POBLACION_TOTAL, 1);
});

test("assertEcegCoreIndicators blocks a silent summary-field mapping loss", () => {
  assert.throws(
    () => assertEcegCoreIndicators([{ id: "poblacion_poblacion_total" }]),
    /missing ECEG core indicators/i
  );
  assert.doesNotThrow(() => assertEcegCoreIndicators(
    ECEG_CORE_INDICATOR_IDS.map((id) => ({ id }))
  ));
});

test("buildEcegSectionBatches uses resumable inclusive ranges of 250", () => {
  const rows = Array.from({ length: 501 }, (_, index) => (
    normalizeEcegSection(parsedSection(index + 1))
  ));
  const batches = buildEcegSectionBatches(rows, { sourceHash });

  assert.deepEqual(
    batches.map(({ start, end, expectedRows }) => ({ start, end, expectedRows })),
    [
      { start: 1, end: 250, expectedRows: 250 },
      { start: 251, end: 500, expectedRows: 250 },
      { start: 501, end: 501, expectedRows: 1 },
    ]
  );
  assert.match(batches[0].sql, /SECCIONES_ECEG/);
  assert.match(batches[0].sql, /DEMOGRAFIA_BATCH_ALREADY_CONFIRMED/);
  assert.match(batches[0].sql, /on conflict on constraint demografia_eceg_secciones_clave_uk/i);
  assert.doesNotMatch(batches[0].sql, /Acambay/);
});

test("section payload deduplicates indicator names to stay below the query limit", () => {
  const rows = Array.from({ length: 250 }, (_, rowIndex) => {
    const indicators = Object.fromEntries(
      Array.from({ length: 220 }, (_, indicatorIndex) => [
        `poblacion_indicador_demografico_oficial_extenso_${indicatorIndex}`,
        { value: rowIndex + indicatorIndex, status: "PRESENTE" },
      ])
    );
    return normalizeEcegSection(parsedSection(rowIndex + 1, indicators));
  });
  const [batch] = buildEcegSectionBatches(rows, { sourceHash });

  assert.ok(
    Buffer.byteLength(batch.sql, "utf8") < 900_000,
    `section SQL is still too large: ${Buffer.byteLength(batch.sql, "utf8")} bytes`
  );
});

test("buildEcegCorrespondenceBatches creates one historical or unmatched row per source", () => {
  const rows = Array.from({ length: 251 }, (_, index) => (
    normalizeEcegSection(parsedSection(index + 1))
  ));
  const batches = buildEcegCorrespondenceBatches(rows, {
    sourceHash,
    cartographyVersionId: 4025,
  });

  assert.equal(batches.length, 2);
  assert.match(batches[0].sql, /CORRESPONDENCIAS_ECEG/);
  assert.match(batches[0].sql, /CLAVE_NUMERICA/);
  assert.match(batches[0].sql, /VINCULO_HISTORICO/);
  assert.match(batches[0].sql, /SIN_EQUIVALENCIA/);
  assert.match(batches[0].sql, /cartografia_version_id = 4025/);
  assert.match(batches[0].sql, /c\.numero = x\.numero_seccion::integer/);
  assert.doesNotMatch(batches[0].sql, /publicada_at = pg_catalog\.now/);
});

test("ECEG batch builders reject unsafe batch sizes and cartography versions", () => {
  const row = normalizeEcegSection(parsedSection(1));
  assert.throws(
    () => buildEcegSectionBatches([row], { sourceHash, batchSize: 0 }),
    /batchSize must be positive/
  );
  assert.throws(
    () => buildEcegCorrespondenceBatches([row], {
      sourceHash,
      cartographyVersionId: 0,
    }),
    /cartographyVersionId must be a positive integer/
  );
});
