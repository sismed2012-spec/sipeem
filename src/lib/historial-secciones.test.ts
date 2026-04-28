import assert from "node:assert/strict";

import {
  buildFuerzaEntries,
  isAggregateSeccion,
  validateSeccionTotals,
} from "./historial-secciones";

function run() {
  const entries = buildFuerzaEntries({
    PAN: 120,
    PRI: 0,
    MORENA: 98,
    CAND_IND1: null,
    PT: 44,
  });

  assert.deepEqual(entries, [
    { fuerza: "PAN", votos: 120 },
    { fuerza: "MORENA", votos: 98 },
    { fuerza: "PT", votos: 44 },
  ]);

  assert.equal(isAggregateSeccion(0), true);
  assert.equal(isAggregateSeccion(1), false);

  const invalidErrors = validateSeccionTotals(
    {
      num_votos_validos: 150,
      num_votos_can_nreg: 2,
      num_votos_nulos: 3,
      total_votos: 156,
    },
    [
      { fuerza: "PAN", votos: 70 },
      { fuerza: "MORENA", votos: 65 },
    ]
  );

  assert.deepEqual(invalidErrors, [
    "La suma de fuerzas (135) no coincide con NUM_VOTOS_VALIDOS (150)",
  ]);

  const validErrors = validateSeccionTotals(
    {
      num_votos_validos: 150,
      num_votos_can_nreg: 2,
      num_votos_nulos: 3,
      total_votos: 155,
    },
    [
      { fuerza: "PAN", votos: 70 },
      { fuerza: "MORENA", votos: 80 },
    ]
  );

  assert.deepEqual(validErrors, []);
}

run();
