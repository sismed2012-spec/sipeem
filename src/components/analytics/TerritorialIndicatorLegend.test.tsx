import assert from "node:assert/strict";
import { it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { buildQuantileScale } from "@/lib/territorial-indicators-map";
import { TerritorialIndicatorLegend } from "./TerritorialIndicatorLegend";

it("renders quantile intervals, no-data and the non-imputation warning", () => {
  const html = renderToStaticMarkup(
    <TerritorialIndicatorLegend
      metricKey="poblacionTotal"
      scale={buildQuantileScale([0, 10, 20, 30, 40])}
    />,
  );
  assert.match(html, /Población total/);
  assert.match(html, /0/);
  assert.match(html, /40/);
  assert.match(html, /Sin dato/);
  assert.match(html, /No se imputan valores faltantes/);
  assert.match(html, /#94a3b8/);
});
