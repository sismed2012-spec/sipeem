import assert from "node:assert/strict";

import {
  buildFuerzaEntries2021,
  getSeccion2021ActasMec,
  getSeccion2021HeaderErrors,
  parseWorksheet2021Number,
} from "./historial-secciones-2021";

function run() {
  assert.equal(parseWorksheet2021Number("1,234"), 1234);
  assert.equal(parseWorksheet2021Number(""), 0);

  const entries = buildFuerzaEntries2021({
    PAN: 120,
    MORENA: "98",
    PT_MORENA_NAEM: 44,
    PRI: 0,
  });

  assert.deepEqual(entries, [
    { fuerza: "PAN", votos: 120 },
    { fuerza: "MORENA", votos: 98 },
    { fuerza: "PT_MORENA_NAEM", votos: 44 },
  ]);

  assert.equal(
    getSeccion2021ActasMec({
      "ACTAS_CASILLA-MEC": "7",
    }),
    7
  );
  assert.equal(
    getSeccion2021ActasMec({
      ACTAS_CASILLA_MEC: "5",
    }),
    5
  );
  assert.equal(getSeccion2021ActasMec({}), 0);

  assert.deepEqual(
    getSeccion2021HeaderErrors([
      "ID_MUNICIPIO",
      "MUNICIPIO",
      "SECCION",
      "CASILLAS",
      "NUM_VOTOS_VALIDOS",
      "NUM_VOTOS_CAN_NREG",
      "NUM_VOTOS_NULOS",
      "TOTAL_VOTOS",
      "LISTA_NOMINAL",
    ]),
    []
  );
}

run();
