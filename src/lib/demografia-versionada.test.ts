import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DemografiaGatewayError,
  DemografiaInputError,
  getVersionedSectionDemographics,
  parseDemografiaSectionParams,
  type DemografiaRpcInvoker,
} from "./demografia-versionada";

describe("parseDemografiaSectionParams", () => {
  it("requires positive section/version IDs and defaults censusYear to 2020", () => {
    assert.deepEqual(
      parseDemografiaSectionParams("2221", new URLSearchParams({ versionId: "4025" })),
      { sectionId: 2221, versionId: 4025, censusYear: 2020 }
    );
    assert.deepEqual(
      parseDemografiaSectionParams(
        "2221",
        new URLSearchParams({ versionId: "4025", censusYear: "2020" })
      ),
      { sectionId: 2221, versionId: 4025, censusYear: 2020 }
    );
  });

  it("rejects malformed IDs and a missing versionId", () => {
    const cases: Array<[string, URLSearchParams]> = [
      ["0", new URLSearchParams({ versionId: "4025" })],
      ["1 OR 1=1", new URLSearchParams({ versionId: "4025" })],
      ["2221", new URLSearchParams()],
      ["2221", new URLSearchParams({ versionId: "-1" })],
      ["2221", new URLSearchParams({ versionId: "4025", censusYear: "2020.5" })],
    ];
    for (const [sectionId, query] of cases) {
      assert.throws(
        () => parseDemografiaSectionParams(sectionId, query),
        DemografiaInputError
      );
    }
  });
});

describe("getVersionedSectionDemographics", () => {
  it("invokes only rpc_demografia_seccion and normalizes its row", async () => {
    const invoke: DemografiaRpcInvoker = async (name, args) => {
      assert.equal(name, "rpc_demografia_seccion");
      assert.deepEqual(args, {
        p_seccion_id: 2221,
        p_cartografia_version_id: 4025,
        p_anio_censal: 2020,
      });
      return {
        data: [{
          section_id: 2221,
          version_id: 4025,
          source: {
            provider: "INEGI",
            datasetKey: "CPV2020_ITER",
            censusYear: 2020,
            sourceGrain: "LOCALIDAD",
            sourceFrameDate: null,
            mappingMethod: "SOLO_DIRECTAS",
            mappingStatus: "PARTIAL",
            warnings: [],
          },
          status: "PARTIAL",
          coverage: {
            includedLocalities: 3,
            pendingLocalities: 1,
            includedPopulation: 1500,
            pendingPopulationReference: null,
            percentage: null,
            isAdditive: false,
          },
          indicators: { pobtot: 1500, graproes: 8.75, reservado: null },
        }],
        error: null,
      };
    };

    assert.deepEqual(
      await getVersionedSectionDemographics(invoke, {
        sectionId: 2221,
        versionId: 4025,
        censusYear: 2020,
      }),
      {
        sectionId: 2221,
        versionId: 4025,
        source: {
          provider: "INEGI",
          datasetKey: "CPV2020_ITER",
          censusYear: 2020,
          sourceGrain: "LOCALIDAD",
          sourceFrameDate: null,
          mappingMethod: "SOLO_DIRECTAS",
          mappingStatus: "PARTIAL",
          warnings: [],
        },
        status: "PARTIAL",
        coverage: {
          includedLocalities: 3,
          pendingLocalities: 1,
          includedPopulation: 1500,
          pendingPopulationReference: null,
          percentage: null,
          isAdditive: false,
        },
        indicators: { pobtot: 1500, graproes: 8.75, reservado: null },
      }
    );
  });

  it("normalizes ECEG section-grain provenance with nullable locality counts", async () => {
    const invoke: DemografiaRpcInvoker = async () => ({
      data: [{
        section_id: 2221,
        version_id: 4025,
        source: {
          provider: "INEGI",
          datasetKey: "CPV2020_ECEG",
          censusYear: 2020,
          sourceGrain: "SECCION",
          sourceFrameDate: "2021-01-31",
          mappingMethod: "CLAVE_NUMERICA",
          mappingStatus: "VINCULO_HISTORICO",
          warnings: ["Marco INE enero 2021"],
        },
        status: "COMPLETE",
        coverage: {
          includedLocalities: null,
          pendingLocalities: null,
          includedPopulation: 2994,
          pendingPopulationReference: null,
          percentage: null,
          isAdditive: false,
        },
        indicators: { pobtot: 2994, POBLACION_POBLACION_TOTAL: 2994 },
      }],
      error: null,
    });

    const result = await getVersionedSectionDemographics(invoke, {
      sectionId: 2221,
      versionId: 4025,
      censusYear: 2020,
    });

    assert.equal(result.source.sourceGrain, "SECCION");
    assert.equal(result.source.sourceFrameDate, "2021-01-31");
    assert.equal(result.coverage.includedLocalities, null);
    assert.deepEqual(result.source.warnings, ["Marco INE enero 2021"]);
    assert.equal(result.indicators.pobtot, 2994);
  });

  it("rejects a response that mixes section-grain ECEG with locality coverage", async () => {
    const invoke: DemografiaRpcInvoker = async () => ({
      data: [{
        section_id: 2221,
        version_id: 4025,
        source: {
          provider: "INEGI",
          datasetKey: "CPV2020_ECEG",
          censusYear: 2020,
          sourceGrain: "SECCION",
          sourceFrameDate: "2021-01-31",
          mappingMethod: "CLAVE_NUMERICA",
          mappingStatus: "VINCULO_HISTORICO",
          warnings: [],
        },
        status: "COMPLETE",
        coverage: {
          includedLocalities: 1,
          pendingLocalities: 0,
          includedPopulation: 2994,
          pendingPopulationReference: null,
          percentage: null,
          isAdditive: false,
        },
        indicators: { pobtot: 2994 },
      }],
      error: null,
    });

    await assert.rejects(
      () => getVersionedSectionDemographics(invoke, {
        sectionId: 2221,
        versionId: 4025,
        censusYear: 2020,
      }),
      DemografiaGatewayError
    );
  });

  it("returns a stable UNAVAILABLE response when the RPC has no row", async () => {
    const invoke: DemografiaRpcInvoker = async () => ({ data: [], error: null });
    const result = await getVersionedSectionDemographics(invoke, {
      sectionId: 2221,
      versionId: 4025,
      censusYear: 2020,
    });

    assert.equal(result.status, "UNAVAILABLE");
    assert.deepEqual(result.coverage, {
      includedLocalities: null,
      pendingLocalities: null,
      includedPopulation: null,
      pendingPopulationReference: null,
      percentage: null,
      isAdditive: false,
    });
    assert.deepEqual(result.indicators, {});
  });

  it("sanitizes RPC and malformed-output failures", async () => {
    const failures: DemografiaRpcInvoker[] = [
      async () => ({ data: null, error: { message: "permission denied for secret_table" } }),
      async () => ({ data: [{ section_id: "not-a-number" }], error: null }),
    ];

    for (const invoke of failures) {
      await assert.rejects(
        () => getVersionedSectionDemographics(invoke, {
          sectionId: 2221,
          versionId: 4025,
          censusYear: 2020,
        }),
        (error: unknown) => {
          assert.ok(error instanceof DemografiaGatewayError);
          assert.equal(error.message, "No se pudo consultar la demografia");
          assert.doesNotMatch(error.message, /secret_table/);
          return true;
        }
      );
    }
  });
});
