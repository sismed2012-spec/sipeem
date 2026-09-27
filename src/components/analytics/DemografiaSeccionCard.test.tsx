import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";

import type { DemografiaSeccionResponse } from "@/lib/demografia-types";
import { createDemografiaRequestCoordinator } from "@/lib/demografia-client";
import { DemografiaSeccionCard } from "./DemografiaSeccionCard";

function response(
  overrides: Partial<DemografiaSeccionResponse> = {}
): DemografiaSeccionResponse {
  return {
    sectionId: 2221,
    versionId: 4025,
    source: {
      provider: "INEGI",
      datasetKey: "CPV2020_ITER",
      censusYear: 2020,
      sourceGrain: "LOCALIDAD",
      sourceFrameDate: null,
      mappingMethod: "SOLO_DIRECTAS",
      mappingStatus: "COMPLETE",
      warnings: [],
    },
    status: "COMPLETE",
    coverage: {
      includedLocalities: 4,
      pendingLocalities: 0,
      includedPopulation: 1234567,
      pendingPopulationReference: null,
      percentage: 100,
      isAdditive: false,
    },
    indicators: {
      pobtot: 1234567,
      pobfem: null,
      pobmas: 600000,
      pob0_14: 250000,
      pob15_64: 850000,
      pob65_mas: 134567,
      graproes: 8.75,
      pea: 700000,
      pder_ss: 1000000,
      tvivhab: 400000,
      vph_inter: 250000,
    },
    ...overrides,
  };
}

describe("DemografiaSeccionCard", () => {
  it("shows ITER fallback provenance, version and core indicators in es-MX", () => {
    const html = renderToStaticMarkup(<DemografiaSeccionCard data={response()} />);

    assert.match(html, /INEGI ITER 2020/);
    assert.match(html, /Fuente complementaria por localidad/);
    assert.match(html, /Versión cartográfica 4025/);
    assert.match(html, /1,234,567/);
    assert.match(html, /8\.75/);
    assert.match(html, /Población y edad/);
    assert.match(html, /Educación y economía/);
    assert.match(html, /Vivienda y servicios/);
    assert.match(html, /Conectividad/);
  });

  it("shows ECEG section grain, January 2021 frame and historical-link warning", () => {
    const html = renderToStaticMarkup(<DemografiaSeccionCard data={response({
      source: {
        provider: "INEGI",
        datasetKey: "CPV2020_ECEG",
        censusYear: 2020,
        sourceGrain: "SECCION",
        sourceFrameDate: "2021-01-31",
        mappingMethod: "CLAVE_NUMERICA",
        mappingStatus: "VINCULO_HISTORICO",
        warnings: ["No implica igualdad geométrica con 2026"],
      },
      coverage: {
        includedLocalities: null,
        pendingLocalities: null,
        includedPopulation: 1234567,
        pendingPopulationReference: null,
        percentage: null,
        isAdditive: false,
      },
    })} />);

    assert.match(html, /INEGI ECEG 2020/);
    assert.match(html, /Marco INE enero 2021/);
    assert.match(html, /Vínculo histórico por clave numérica/);
    assert.match(html, /No implica igualdad geométrica con 2026/);
    assert.doesNotMatch(html, /localidades incluidas/);
  });

  it("distinguishes a verified direct ECEG match from no territorial equivalence", () => {
    const direct = renderToStaticMarkup(<DemografiaSeccionCard data={response({
      source: {
        provider: "INEGI",
        datasetKey: "CPV2020_ECEG",
        censusYear: 2020,
        sourceGrain: "SECCION",
        sourceFrameDate: "2021-01-31",
        mappingMethod: "EQUIVALENCIA_OFICIAL",
        mappingStatus: "DIRECTA",
        warnings: [],
      },
    })} />);
    const unmatched = renderToStaticMarkup(<DemografiaSeccionCard data={response({
      source: {
        provider: "INEGI",
        datasetKey: "CPV2020_ECEG",
        censusYear: 2020,
        sourceGrain: "SECCION",
        sourceFrameDate: "2021-01-31",
        mappingMethod: "SIN_MATCH",
        mappingStatus: "SIN_EQUIVALENCIA",
        warnings: [],
      },
    })} />);

    assert.match(direct, /Equivalencia territorial verificada/);
    assert.match(unmatched, /Sin equivalencia territorial/);
  });

  it("shows an explicit partial warning and honest included/pending counts", () => {
    const html = renderToStaticMarkup(<DemografiaSeccionCard data={response({
      status: "PARTIAL",
      coverage: {
        includedLocalities: 3,
        pendingLocalities: 2,
        includedPopulation: 900,
        pendingPopulationReference: null,
        percentage: null,
        isAdditive: false,
      },
    })} />);

    assert.match(html, /Cobertura parcial/);
    assert.match(html, /3 localidades incluidas/);
    assert.match(html, /2 pendientes/);
    assert.match(html, /Cobertura no calculable/);
    assert.doesNotMatch(html, />0%?</);
  });

  it("renders unavailable and reserved values without inventing zeros", () => {
    const unavailable = renderToStaticMarkup(
      <DemografiaSeccionCard data={response({ status: "UNAVAILABLE", indicators: {} })} />
    );
    const complete = renderToStaticMarkup(<DemografiaSeccionCard data={response()} />);

    assert.match(unavailable, /Datos demográficos no disponibles/);
    assert.match(unavailable, /Sin equivalencia ECEG publicada ni respaldo ITER/);
    assert.match(complete, /Población femenina[\s\S]*—/);
  });
});

describe("demographic request coordinator", () => {
  it("ignores a late A response after B and invalidates work on clear", async () => {
    type Pending = {
      resolve: (value: DemografiaSeccionResponse) => void;
      signal: AbortSignal;
    };
    const pending = new Map<string, Pending>();
    const delivered: Array<DemografiaSeccionResponse | null> = [];
    const coordinator = createDemografiaRequestCoordinator(
      (key, signal) => new Promise((resolve) => {
        pending.set(key, { resolve, signal });
      }),
      (value) => delivered.push(value)
    );

    const a = coordinator.select({ sectionId: 101, versionId: 4025, censusYear: 2020 });
    const b = coordinator.select({ sectionId: 102, versionId: 4026, censusYear: 2020 });
    assert.equal(pending.get("101:4025:2020")?.signal.aborted, true);
    pending.get("102:4026:2020")?.resolve(response({ sectionId: 102, versionId: 4026 }));
    await b;
    pending.get("101:4025:2020")?.resolve(response({ sectionId: 101, versionId: 4025 }));
    await a;

    assert.deepEqual(
      delivered.filter((value): value is DemografiaSeccionResponse => value !== null)
        .map(({ sectionId, versionId }) => [sectionId, versionId]),
      [[102, 4026]]
    );

    const c = coordinator.select({ sectionId: 103, versionId: 4025, censusYear: 2020 });
    coordinator.clear();
    assert.equal(pending.get("103:4025:2020")?.signal.aborted, true);
    pending.get("103:4025:2020")?.resolve(response({ sectionId: 103 }));
    await c;
    assert.equal(delivered.at(-1), null);
  });
});
