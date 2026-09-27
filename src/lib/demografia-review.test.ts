import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DemografiaReviewGatewayError,
  DemografiaReviewInputError,
  getDemografiaReviewQueue,
  parseDemografiaReviewParams,
  type DemografiaReviewRpcInvoker,
} from "./demografia-review";

const rpcRow = {
  selectedVersion: {
    id: 4025,
    key: "INE_EDOMEX_2026_PRE_RESECCIONAMIENTO",
    state: "PUBLICADA",
    isDefault: true,
  },
  versions: [
    {
      id: 4025,
      key: "INE_EDOMEX_2026_PRE_RESECCIONAMIENTO",
      state: "PUBLICADA",
      isDefault: true,
    },
  ],
  source: {
    id: 1,
    provider: "INEGI",
    datasetKey: "CPV2020_ITER",
    censusYear: 2020,
  },
  summary: {
    totalPending: 4565,
    multisection: 1325,
    manualReview: 31,
    unmatched: 3209,
  },
  municipalities: [
    { key: "091", name: "TENANGO DEL VALLE", pending: 42 },
  ],
  items: [
    {
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
        latitude: 19.10,
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
    },
  ],
  pagination: { offset: 0, limit: 25, total: 1, hasMore: false },
};

describe("parseDemografiaReviewParams", () => {
  it("normalizes optional review filters with bounded pagination", () => {
    assert.deepEqual(
      parseDemografiaReviewParams(
        new URLSearchParams({
          versionId: "4025",
          status: "MULTISECCION",
          municipality: "091",
          search: "  San Miguel  ",
          limit: "25",
          offset: "50",
        })
      ),
      {
        versionId: 4025,
        status: "MULTISECCION",
        municipality: "091",
        search: "San Miguel",
        limit: 25,
        offset: 50,
      }
    );
  });

  it("rejects unsupported states, malformed keys and unbounded requests", () => {
    const invalid: Array<Record<string, string>> = [
      { status: "DIRECTA" },
      { municipality: "91" },
      { versionId: "0" },
      { limit: "101" },
      { offset: "-1" },
      { search: "x".repeat(101) },
    ];

    for (const query of invalid) {
      assert.throws(
        () => parseDemografiaReviewParams(new URLSearchParams(query)),
        DemografiaReviewInputError
      );
    }
  });
});

describe("demographic review RPC gateway", () => {
  it("calls only the controlled read RPC and normalizes its response", async () => {
    const invoke: DemografiaReviewRpcInvoker = async (name, args) => {
      assert.equal(name, "rpc_demografia_revision_bandeja");
      assert.deepEqual(args, {
        p_cartografia_version_id: 4025,
        p_estado: "MULTISECCION",
        p_clave_municipio: "091",
        p_busqueda: "San Miguel",
        p_limite: 25,
        p_offset: 0,
      });
      return { data: rpcRow, error: null };
    };

    const result = await getDemografiaReviewQueue(invoke, {
      versionId: 4025,
      status: "MULTISECCION",
      municipality: "091",
      search: "San Miguel",
      limit: 25,
      offset: 0,
    });

    assert.equal(result.summary.totalPending, 4565);
    assert.equal(result.items[0].locality.population, 6404);
    assert.equal(result.items[0].candidates[0].number, 4488);
  });

  it("rejects malformed or cross-version RPC payloads", async () => {
    const cases = [
      { ...rpcRow, selectedVersion: { ...rpcRow.selectedVersion, id: 4026 } },
      { ...rpcRow, summary: { ...rpcRow.summary, totalPending: -1 } },
      { ...rpcRow, items: [{ ...rpcRow.items[0], status: "DIRECTA" }] },
      {
        ...rpcRow,
        items: [{ ...rpcRow.items[0], nameSimilarity: 1.01 }],
      },
    ];

    for (const data of cases) {
      await assert.rejects(
        () => getDemografiaReviewQueue(
          async () => ({ data, error: null }),
          {
            versionId: 4025,
            status: null,
            municipality: null,
            search: null,
            limit: 25,
            offset: 0,
          }
        ),
        DemografiaReviewGatewayError
      );
    }
  });
});
