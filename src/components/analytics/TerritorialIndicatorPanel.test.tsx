import assert from "node:assert/strict";
import { it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { TerritorialIndicatorPanel } from "./TerritorialIndicatorPanel";

it("renders controlled mode, level, metric, provenance and recovery controls", () => {
  const html = renderToStaticMarkup(
    <TerritorialIndicatorPanel
      mode="INDICATOR"
      level="MUNICIPIO"
      metricKey="poblacionTotal"
      versionId={4025}
      nominalSource={{ id: 7, cutoffDate: "2026-07-31" }}
      demographicSource={{ id: 9, censusYear: 2020 }}
      loading
      error="No fue posible cargar"
      onModeChange={() => undefined}
      onLevelChange={() => undefined}
      onMetricChange={() => undefined}
      onRetry={() => undefined}
    />,
  );

  for (const label of [
    "Mapa político",
    "Indicador territorial",
    "Municipio",
    "Distrito local",
    "Distrito federal",
    "Padrón electoral",
    "Lista nominal",
    "Cobertura padrón-lista",
    "Población total",
    "Población económicamente activa",
    "Población ocupada",
    "Población con discapacidad",
    "Viviendas habitadas",
    "Viviendas con internet",
    "Corte nominal: 31 jul 2026",
    "Año demográfico: 2020",
    "Cargando indicadores",
    "No fue posible cargar",
    "Reintentar",
  ]) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /disabled=""/);
  assert.doesNotMatch(html, /fetch\(/);
});
