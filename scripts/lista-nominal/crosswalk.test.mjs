import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildListaNominalCrosswalkBatch,
  classifyExactCandidates,
} from "./crosswalk.mjs";

const SOURCE_HASH = "d".repeat(64);

describe("exact nominal-list crosswalk", () => {
  it("requires entity, municipality and section simultaneously", () => {
    const source = {
      claveEntidad: "15",
      claveMunicipio: "024",
      numeroSeccion: 696,
    };
    const sameNumberWrongMunicipality = {
      cartografiaSeccionId: 10,
      seccionId: 20,
      municipioId: 25,
      claveEntidad: "15",
      claveMunicipio: "025",
      numeroSeccion: 696,
    };
    const exact = {
      cartografiaSeccionId: 11,
      seccionId: 21,
      municipioId: 24,
      claveEntidad: "15",
      claveMunicipio: "024",
      numeroSeccion: 696,
    };

    assert.deepEqual(
      classifyExactCandidates(source, [sameNumberWrongMunicipality]),
      { state: "PENDIENTE", candidate: null, candidateCount: 0 },
    );
    assert.deepEqual(classifyExactCandidates(source, [exact]), {
      state: "VINCULADA",
      candidate: exact,
      candidateCount: 1,
    });
    assert.deepEqual(classifyExactCandidates(source, [exact, { ...exact }]), {
      state: "AMBIGUA",
      candidate: null,
      candidateCount: 2,
    });
  });

  it("builds one idempotent version-scoped evaluation per source row", () => {
    const batch = buildListaNominalCrosswalkBatch({
      sourceHash: SOURCE_HASH,
      cartographyVersionId: 4025,
    });

    assert.equal(batch.stage, "CORRESPONDENCIAS");
    assert.equal(batch.expectedRows, 7191);
    assert.match(batch.sql, /cs\.clave_entidad = n\.clave_entidad/i);
    assert.match(batch.sql, /cm\.clave_municipio = n\.clave_municipio/i);
    assert.match(batch.sql, /cs\.numero = n\.numero_seccion/i);
    assert.match(batch.sql, /cs\.cartografia_version_id = 4025/i);
    assert.match(batch.sql, /when candidate_count = 0 then 'PENDIENTE'/i);
    assert.match(batch.sql, /when candidate_count = 1 then 'VINCULADA'/i);
    assert.match(batch.sql, /else 'AMBIGUA'/i);
    assert.match(
      batch.sql,
      /on conflict on constraint lista_nominal_correspondencias_evaluacion_uk/i,
    );
    assert.doesNotMatch(
      batch.sql,
      /(update|delete|insert into) public\.(cartografia|territorios)_/i,
    );
    assert.equal(
      batch.checksum,
      buildListaNominalCrosswalkBatch({
        sourceHash: SOURCE_HASH,
        cartographyVersionId: 4025,
      }).checksum,
    );
  });
});
