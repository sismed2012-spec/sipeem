import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";

import type { ListaNominalSeccionResponse } from "@/lib/lista-nominal-types";
import { ListaNominalSeccionCard } from "./ListaNominalSeccionCard";

function available(): ListaNominalSeccionResponse {
  return {
    sectionId: 2221,
    versionId: 4025,
    cutoffDate: "2026-07-31",
    source: { provider: "INE", fileName: "S.xlsx", sha256: "a".repeat(64) },
    status: "AVAILABLE",
    padron: { men: 600000, women: 634567, nonBinary: 0, total: 1234567 },
    nominal: { men: 590000, women: 620000, nonBinary: 0, total: 1210000 },
    difference: 24567,
    coverage: 98.00925830756844,
  };
}

describe("ListaNominalSeccionCard", () => {
  it("renders the official cutoff and all electoral counts in es-MX", () => {
    const html = renderToStaticMarkup(
      <ListaNominalSeccionCard data={available()} />,
    );
    assert.match(html, /Lista nominal INE/);
    assert.match(html, /31\/07\/2026/);
    assert.match(html, /Versión cartográfica 4025/);
    assert.match(html, /Padrón electoral/);
    assert.match(html, /1,234,567/);
    assert.match(html, /Lista nominal/);
    assert.match(html, /1,210,000/);
    assert.match(html, /Hombres/);
    assert.match(html, /Mujeres/);
    assert.match(html, /No binario/);
    assert.match(html, /Diferencia/);
    assert.match(html, /24,567/);
    assert.match(html, /Cobertura/);
    assert.match(html, /98\.01%/);
  });

  it("renders unavailable explicitly without substituting plausible zeros", () => {
    const html = renderToStaticMarkup(
      <ListaNominalSeccionCard
        data={{
          sectionId: 2221,
          versionId: 4025,
          cutoffDate: null,
          source: null,
          status: "UNAVAILABLE",
          padron: null,
          nominal: null,
          difference: null,
          coverage: null,
        }}
      />,
    );
    assert.match(html, /Sin dato nominal para este corte/);
    assert.doesNotMatch(html, />0</);
    assert.doesNotMatch(html, /0%/);
  });
});
