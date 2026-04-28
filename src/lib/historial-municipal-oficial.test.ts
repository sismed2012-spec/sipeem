import assert from "node:assert/strict";

import {
  buildMunicipalOfficialRow,
  pickMunicipalWinnerSiglas,
} from "./historial-municipal-oficial";

function run() {
  const row = buildMunicipalOfficialRow([
    "5",
    "ALMOLOYA DE JUAREZ 1",
    "56",
    "202",
    "203",
    "128,893",
    "1,919",
    "29,597",
    "3,104",
    null,
    null,
    "14,054",
    null,
    "1,060",
    null,
    "30,840",
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    "80,574",
    "62",
    "3,678",
    "84,314",
    "65.41%",
    "COALICIÓN PVEM-PT-MORENA",
    "30,840",
    "38.28%",
    "PRI",
    "29,597",
    "36.73%",
    "1,243",
    "1.54%",
    "https://example.com",
  ]);

  assert.equal(row.geo_municipio_id, 5);
  assert.equal(row.municipio_nombre, "ALMOLOYA DE JUAREZ 1");
  assert.equal(row.votos_validos, 80574);
  assert.equal(row.total_votos, 84314);
  assert.equal(row.fuerzas.PRI, 29597);
  assert.equal(row.fuerzas.PVEM_PT_MORENA, 30840);
  assert.equal(row.ganador_siglas, "PVEM_PT_MORENA");
  assert.equal(row.segundo_siglas, "PRI");

  assert.equal(
    pickMunicipalWinnerSiglas({
      MORENA: 120,
      PAN: 80,
      CC_PAN_PRI_PRD_NAEM: 0,
    }),
    "MORENA"
  );
}

run();
