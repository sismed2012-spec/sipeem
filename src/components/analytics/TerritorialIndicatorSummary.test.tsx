import assert from "node:assert/strict";
import { it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { TerritorialIndicatorRow } from "@/lib/territorial-indicators-types";
import { TerritorialIndicatorSummary } from "./TerritorialIndicatorSummary";

const row = {
  level: "MUNICIPIO",
  territoryId: 1,
  cartographyTerritoryId: 2,
  key: "001",
  name: "Acambay",
  totalSections: 2,
  nominalSections: 1,
  demographicSections: 1,
  nominalSourceCoveragePercent: 50,
  demographicSourceCoveragePercent: 50,
  metricQuality: {},
  metrics: { pea: 0, poblacionConDiscapacidad: null },
} as unknown as TerritorialIndicatorRow;

it("shows value, provenance and section coverage while preserving zero and null", () => {
  const common = {
    row,
    nominalSource: { id: 7, cutoffDate: "2026-07-31" },
    demographicSource: { id: 9, censusYear: 2020 },
  };
  const zeroHtml = renderToStaticMarkup(
    <TerritorialIndicatorSummary {...common} metricKey="pea" />,
  );
  assert.match(zeroHtml, /Población económicamente activa/);
  assert.match(zeroHtml, />0</);
  assert.match(zeroHtml, /Corte nominal 31 jul 2026/);
  assert.match(zeroHtml, /Censo 2020/);
  assert.match(zeroHtml, /Nominal: 1 \/ 2 secciones/);
  assert.match(zeroHtml, /Demografía: 1 \/ 2 secciones/);

  const nullHtml = renderToStaticMarkup(
    <TerritorialIndicatorSummary
      {...common}
      metricKey="poblacionConDiscapacidad"
    />,
  );
  assert.match(nullHtml, /Sin dato/);
});
