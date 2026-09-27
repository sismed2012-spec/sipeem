import assert from "node:assert/strict";
import test from "node:test";

import {
  buildIndicatorBatches,
  buildLocalityBatches,
  buildSourceBatch,
  checksumBatch,
  normalizeLocalityRow,
} from "./sql-batches.mjs";

const source = {
  sourceHash: "a".repeat(64),
  fileName: "iter-fixture.zip",
  encodings: { dataset: "utf-8" },
  totalRows: 5136,
  columnCount: 286,
};

function locality(index) {
  return {
    clave_entidad: "15",
    clave_municipio: "001",
    clave_localidad: String(index).padStart(4, "0"),
    nombre_entidad: "México",
    nombre_municipio: "Acambay",
    nombre_localidad: `Localidad sensible ${index}`,
    longitud: -99.8,
    latitud: 19.9,
    altitud: 2500,
    fila_origen: index + 1,
    registro_sha256: String(index).padStart(64, "0").slice(-64),
    pobtot: index,
    indicadores: {},
    estados_dato: {},
  };
}

test("buildSourceBatch is deterministic and keeps source data inside base64 JSON", () => {
  const first = buildSourceBatch(source);
  const second = buildSourceBatch(source);

  assert.equal(first.checksum, second.checksum);
  assert.equal(first.sql, second.sql);
  assert.match(first.sql, /^begin;/i);
  assert.match(first.sql, /decode\('[A-Za-z0-9+/=]+', 'base64'\)/);
  assert.match(first.sql, /on conflict/i);
  assert.match(first.sql, /commit;\s*$/i);
  assert.doesNotMatch(first.sql, /iter-fixture\.zip/);
});

test("buildIndicatorBatches uses stable inclusive ranges", () => {
  const indicators = Array.from({ length: 501 }, (_, index) => ({
    mnemonic: `I_${index + 1}`,
    name: `Indicador ${index + 1}`,
    description: null,
    logicalType: "ENTERO",
    unit: "PERSONAS",
    category: null,
    reserveRule: { marker: "*" },
    exposeSummary: false,
    order: index,
  }));

  const batches = buildIndicatorBatches(indicators, { sourceHash: source.sourceHash });

  assert.deepEqual(
    batches.map(({ start, end, expectedRows }) => ({ start, end, expectedRows })),
    [
      { start: 1, end: 250, expectedRows: 250 },
      { start: 251, end: 500, expectedRows: 250 },
      { start: 501, end: 501, expectedRows: 1 },
    ]
  );
});

test("buildLocalityBatches emits atomic resumable SQL without plaintext locality names", () => {
  const batches = buildLocalityBatches(
    Array.from({ length: 251 }, (_, index) => locality(index + 1)),
    { sourceHash: source.sourceHash }
  );

  assert.equal(batches.length, 2);
  assert.match(batches[0].sql, /DEMOGRAFIA_BATCH_ALREADY_CONFIRMED/);
  assert.match(batches[0].sql, /demografia_cargas_lotes/);
  assert.match(batches[0].sql, /on conflict/i);
  assert.match(
    batches[0].sql,
    /st_makepoint\(x\.longitud::numeric\(11, 7\), x\.latitud::numeric\(10, 7\)\)/
  );
  assert.doesNotMatch(batches[0].sql, /Localidad sensible/);
  assert.equal(checksumBatch(batches[0].descriptor), batches[0].checksum);
});

test("normalizeLocalityRow preserves reserved values and geographic coordinate order", () => {
  const row = {
    ENTIDAD: "15",
    NOM_ENT: "México",
    MUN: "001",
    NOM_MUN: "Acambay",
    LOC: "0001",
    NOM_LOC: "San José",
    LONGITUD: `99°50'38.515" W`,
    LATITUD: `19°57'22.423" N`,
    ALTITUD: "2500",
    POBTOT: "0",
    POBFEM: "*",
    GRAPROES: "8.5",
    OTRO: "*",
  };

  const normalized = normalizeLocalityRow(row, Object.keys(row), 2);

  assert.equal(normalized.longitud, -99.8440319);
  assert.equal(normalized.latitud, 19.9562286);
  assert.equal(normalized.pobtot, 0);
  assert.equal(normalized.pobfem, null);
  assert.equal(normalized.graproes, 8.5);
  assert.equal(normalized.indicadores.OTRO, null);
  assert.equal(normalized.estados_dato.POBFEM, "RESERVADO");
  assert.equal(normalized.estados_dato.OTRO, "RESERVADO");
});
