import assert from "node:assert/strict";

import { resolvePopupContext } from "./map-popup-resolvers";

function run() {
  const analytics = {
    municipio_id: 2,
    geo_municipio_id: 1,
    municipio_nombre: "Acambay",
    partido_ganador_id: 10,
    partido_siglas: "PAN",
    partido_color: "#1d4ed8",
    anio: 2024,
    votos_ganador: 1000,
    porcentaje_ganador: 40,
    alternancia_count: 1,
    margin: 120,
    source: "oficial_municipal",
    consistency_status: "consistente",
    diff_validos: 0,
  } as const;

  const byGeoId = new Map([[1, analytics]]);
  const byMunicipioId = new Map([[2, analytics]]);

  const fromCveGeo = resolvePopupContext(
    { CVEGEO: "15001" },
    byGeoId,
    byMunicipioId
  );
  assert.equal(fromCveGeo.analytics?.municipio_id, 2);
  assert.equal(fromCveGeo.municipioId, 2);

  const fromMunicipioId = resolvePopupContext(
    { municipio_id: 2 },
    byGeoId,
    byMunicipioId
  );
  assert.equal(fromMunicipioId.analytics?.geo_municipio_id, 1);
  assert.equal(fromMunicipioId.municipioId, 2);

  const selectedWins = resolvePopupContext(
    { municipio_id: 2 },
    byGeoId,
    byMunicipioId,
    99
  );
  assert.equal(selectedWins.municipioId, 99);
}

run();
