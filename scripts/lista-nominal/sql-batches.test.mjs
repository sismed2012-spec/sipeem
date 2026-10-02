import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCutBatch,
  buildPublishBatch,
  buildSectionBatches,
} from "./sql-batches.mjs";

const SOURCE_HASH = "a".repeat(64);

function sourceRow(index) {
  return {
    distritoFederal: "01",
    distritoFederalNombre: "Distrito federal",
    distritoLocal: "14",
    distritoLocalNombre: "Distrito local",
    municipioClave: "001",
    municipioNombre: "Municipio",
    seccion: String(index).padStart(4, "0"),
    padronHombres: 8,
    padronMujeres: 10,
    padronNoBinario: 0,
    padronTotal: 18,
    listaHombres: 8,
    listaMujeres: 9,
    listaNoBinario: 0,
    listaTotal: 17,
    diferencia: 1,
    cobertura: (17 / 18) * 100,
    sourceRow: index + 13,
  };
}

const cut = {
  sourceHash: SOURCE_HASH,
  fileName: "S.xlsx",
  cutoffDate: "2026-07-31",
  profile: {
    sections: 7191,
    padron: 13_407_250,
    nominal: 13_206_301,
    difference: 200_949,
  },
  foreignResidents: sourceRow(0),
};

describe("nominal-list SQL batches", () => {
  it("generates deterministic cut SQL keyed by source hash", () => {
    const first = buildCutBatch(cut);
    const second = buildCutBatch(structuredClone(cut));

    assert.equal(first.checksum, second.checksum);
    assert.equal(first.sql, second.sql);
    assert.match(first.sql, /insert into public\.lista_nominal_cortes \(/i);
    assert.match(
      first.sql,
      /on conflict on constraint lista_nominal_cortes_archivo_sha256_uk/i,
    );
    assert.match(first.sql, /where public\.lista_nominal_cortes\.estado not in \('PUBLICADO', 'ARCHIVADO'\)/i);
    assert.doesNotMatch(first.sql, /service[_-]?role|password|postgresql:\/\//i);
  });

  it("bounds section batches to 250 rows and preserves source rows", () => {
    const rows = Array.from({ length: 501 }, (_, index) => sourceRow(index + 1));
    const batches = buildSectionBatches(rows, {
      sourceHash: SOURCE_HASH,
      batchSize: 250,
    });

    assert.deepEqual(
      batches.map((batch) => [batch.start, batch.end, batch.expectedRows]),
      [
        [1, 250, 250],
        [251, 500, 250],
        [501, 501, 1],
      ],
    );
    assert.match(batches[0].sql, /fila_origen/i);
    assert.match(batches[0].sql, /insert into public\.lista_nominal_secciones \(/i);
    assert.match(
      batches[0].sql,
      /on conflict on constraint lista_nominal_secciones_corte_entidad_numero_uk/i,
    );
    assert.doesNotMatch(batches[0].sql, /select \*/i);
    assert.equal(
      batches[0].checksum,
      buildSectionBatches(rows, { sourceHash: SOURCE_HASH, batchSize: 250 })[0]
        .checksum,
    );
  });

  it("rejects oversized or invalid batch sizes", () => {
    assert.throws(
      () => buildSectionBatches([sourceRow(1)], { sourceHash: SOURCE_HASH, batchSize: 251 }),
      /batchSize.*1.*250/i,
    );
    assert.throws(
      () => buildSectionBatches([sourceRow(1)], { sourceHash: SOURCE_HASH, batchSize: 0 }),
      /batchSize.*1.*250/i,
    );
  });

  it("builds a publish gate that requires a complete validated cut", () => {
    const batch = buildPublishBatch({
      sourceHash: SOURCE_HASH,
      cartographyVersionId: 4025,
    });

    assert.match(batch.sql, /estado <> 'VALIDADO'/i);
    assert.match(batch.sql, /filas_secciones/i);
    assert.match(batch.sql, /count\(\*\).*lista_nominal_secciones/is);
    assert.match(batch.sql, /set estado = 'PUBLICADO'/i);
    assert.match(batch.sql, /cartografia_version_id = 4025/i);
    assert.match(batch.sql, /count\(\*\).*lista_nominal_correspondencias/is);
  });
});
