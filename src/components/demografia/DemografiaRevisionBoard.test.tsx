import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";

import type { DemografiaReviewResponse } from "@/lib/demografia-review";
import { DemografiaRevisionBoard } from "./DemografiaRevisionBoard";

const data: DemografiaReviewResponse = {
  selectedVersion: { id: 4025, key: "INE_EDOMEX_2026", state: "PUBLICADA", isDefault: true },
  versions: [{ id: 4025, key: "INE_EDOMEX_2026", state: "PUBLICADA", isDefault: true }],
  source: { id: 1, provider: "INEGI", datasetKey: "CPV2020_ITER", censusYear: 2020 },
  summary: { totalPending: 4565, multisection: 1325, manualReview: 31, unmatched: 3209 },
  municipalities: [{ key: "091", name: "TENANGO DEL VALLE", pending: 42 }],
  items: [{
    correspondenceId: 99,
    status: "MULTISECCION",
    method: "ESPACIAL",
    candidateCount: 2,
    strictCoverage: false,
    distanceMeters: 14.25,
    nameSimilarity: 0.91,
    confidence: 0.75,
    evidence: { weighted: false },
    locality: {
      id: 77,
      stateKey: "15",
      municipalityKey: "091",
      localityKey: "0001",
      municipalityName: "TENANGO DEL VALLE",
      name: "SAN MIGUEL",
      population: 6404,
      latitude: 19.1,
      longitude: -99.59,
    },
    cartographicLocality: null,
    candidates: [
      {
        sectionId: 8397,
        cartographicSectionId: 8216,
        number: 4488,
        municipalityKey: "091",
        municipalityName: "TENANGO DEL VALLE",
        contactType: "AREA",
        intersectionArea: 125.5,
        proportion: 0.65,
        evidence: { weighted: false },
      },
      {
        sectionId: 8398,
        cartographicSectionId: 8217,
        number: 4489,
        municipalityKey: "091",
        municipalityName: "TENANGO DEL VALLE",
        contactType: "BORDE",
        intersectionArea: 0,
        proportion: 0,
        evidence: { weighted: false },
      },
    ],
  }],
  pagination: { offset: 0, limit: 50, total: 1, hasMore: false },
};

describe("DemografiaRevisionBoard", () => {
  it("renders the review summary, filters and territorial evidence", () => {
    const html = renderToStaticMarkup(
      <DemografiaRevisionBoard data={data} filters={{
        versionId: 4025,
        status: null,
        municipality: null,
        search: null,
        limit: 50,
        offset: 0,
      }} />
    );

    assert.match(html, /4,565/);
    assert.match(html, /1,325/);
    assert.match(html, /3,209/);
    assert.match(html, /TENANGO DEL VALLE/);
    assert.match(html, /SAN MIGUEL/);
    assert.match(html, /6,404/);
    assert.match(html, /Sección 4488/);
    assert.match(html, /65%/);
    assert.match(html, /Sólo lectura/);
    assert.doesNotMatch(html, /Guardar|Asignar|Resolver/);
  });

  it("renders an explicit empty filtered state", () => {
    const html = renderToStaticMarkup(
      <DemografiaRevisionBoard
        data={{ ...data, items: [], pagination: { offset: 0, limit: 50, total: 0, hasMore: false } }}
        filters={{ versionId: 4025, status: "REVISION_MANUAL", municipality: null, search: "XYZ", limit: 50, offset: 0 }}
      />
    );

    assert.match(html, /No hay localidades pendientes con estos filtros/);
  });
});
