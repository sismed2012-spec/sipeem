import assert from "node:assert/strict";
import { it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { TerritorialIndicatorRow } from "@/lib/territorial-indicators-types";
import { TerritorialIndicatorPopup } from "./TerritorialIndicatorPopup";

const district = {
  level: "DISTRITO_LOCAL",
  territoryId: 1,
  cartographyTerritoryId: 11,
  key: "1",
  name: "Distrito local 1",
  totalSections: 20,
  nominalSections: 18,
  demographicSections: 15,
  nominalSourceCoveragePercent: 90,
  demographicSourceCoveragePercent: 75,
  metrics: { poblacionTotal: 123456 },
} as unknown as TerritorialIndicatorRow;

it("shows district identity, indicator, provenance and both coverages", () => {
  const html = renderToStaticMarkup(
    <TerritorialIndicatorPopup
      row={district}
      metricKey="poblacionTotal"
      nominalSource={{ id: 7, cutoffDate: "2026-07-31" }}
      demographicSource={{ id: 9, censusYear: 2020 }}
      onClose={() => undefined}
    />,
  );
  assert.match(html, /Distrito local/);
  assert.match(html, /Distrito local 1/);
  assert.match(html, /Población total/);
  assert.match(html, /123,456/);
  assert.match(html, /Corte nominal 31 jul 2026/);
  assert.match(html, /Censo 2020/);
  assert.match(html, /Nominal: 18 \/ 20 secciones/);
  assert.match(html, /Demografía: 15 \/ 20 secciones/);
});
