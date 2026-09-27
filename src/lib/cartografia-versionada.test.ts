import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CartografiaGatewayError,
  CartografiaInputError,
  getVersionedSections,
  listCartografiaVersions,
  parseResolverParams,
  parseViewportParams,
  resolveVersionedTerritory,
  type CartografiaRpcInvoker,
} from "./cartografia-versionada";

describe("parseViewportParams", () => {
  it("normalizes a bounded versioned viewport request", () => {
    const result = parseViewportParams(
      new URLSearchParams({
        versionId: "4025",
        minLon: "-100.75",
        minLat: "18.30",
        maxLon: "-98.50",
        maxLat: "20.35",
        municipio: "001",
        limit: "7052",
      })
    );

    assert.deepEqual(result, {
      versionId: 4025,
      minLon: -100.75,
      minLat: 18.3,
      maxLon: -98.5,
      maxLat: 20.35,
      municipio: "001",
      limit: 7052,
    });
  });

  it("rejects inverted, unbounded or malformed viewport requests", () => {
    const cases: Array<Record<string, string>> = [
      { versionId: "0", minLon: "-100", minLat: "18", maxLon: "-99", maxLat: "20" },
      { versionId: "4025", minLon: "-99", minLat: "18", maxLon: "-100", maxLat: "20" },
      { versionId: "4025", minLon: "-100", minLat: "91", maxLon: "-99", maxLat: "92" },
      { versionId: "4025", minLon: "-180", minLat: "-90", maxLon: "180", maxLat: "90" },
      { versionId: "4025", minLon: "-100", minLat: "18", maxLon: "-99", maxLat: "20", municipio: "1 OR 1=1" },
      { versionId: "4025", minLon: "-100", minLat: "18", maxLon: "-99", maxLat: "20", limit: "10001" },
    ];

    for (const query of cases) {
      assert.throws(
        () => parseViewportParams(new URLSearchParams(query)),
        CartografiaInputError
      );
    }
  });
});

describe("parseResolverParams", () => {
  it("requires an explicit version and valid WGS84 coordinates", () => {
    assert.deepEqual(
      parseResolverParams(
        new URLSearchParams({
          versionId: "4025",
          lat: "19.9620938413329",
          lon: "-99.8529742035995",
        })
      ),
      {
        versionId: 4025,
        lat: 19.9620938413329,
        lon: -99.8529742035995,
      }
    );

    const cases: Array<Record<string, string>> = [
      { lat: "19", lon: "-99" },
      { versionId: "4025", lat: "-91", lon: "-99" },
      { versionId: "4025", lat: "19", lon: "181" },
    ];

    for (const query of cases) {
      assert.throws(
        () => parseResolverParams(new URLSearchParams(query)),
        CartografiaInputError
      );
    }
  });
});

describe("cartografia RPC gateway", () => {
  it("normalizes the consultable version catalog", async () => {
    const invoke: CartografiaRpcInvoker = async (name, args) => {
      assert.equal(name, "rpc_listar_versiones_cartograficas");
      assert.equal(args, undefined);
      return {
        data: [
          {
            cartografia_version_id: 4025,
            clave: "INE_EDOMEX_2026_PRE_RESECCIONAMIENTO",
            nombre: "INE Estado de México 2026",
            estado: "PUBLICADA",
            fecha_corte: "2026-09-01",
            fecha_publicacion: "2026-09-25",
            fecha_publicacion_esperada: null,
            vigente_desde: "2026-09-25",
            vigente_hasta: null,
            es_predeterminada: true,
            conteos: { SECCION: 7052 },
          },
        ],
        error: null,
      };
    };

    assert.deepEqual(await listCartografiaVersions(invoke), [
      {
        id: 4025,
        key: "INE_EDOMEX_2026_PRE_RESECCIONAMIENTO",
        name: "INE Estado de México 2026",
        state: "PUBLICADA",
        cutoffDate: "2026-09-01",
        publicationDate: "2026-09-25",
        expectedPublicationDate: null,
        validFrom: "2026-09-25",
        validUntil: null,
        isDefault: true,
        counts: { SECCION: 7052 },
      },
    ]);
  });

  it("converts viewport rows into a version-tagged GeoJSON collection", async () => {
    const invoke: CartografiaRpcInvoker = async (name, args) => {
      assert.equal(name, "rpc_secciones_en_vista");
      assert.deepEqual(args, {
        p_cartografia_version_id: 4025,
        p_clave_municipio: "001",
        p_min_long: -100.75,
        p_min_lat: 18.3,
        p_max_long: -98.5,
        p_max_lat: 20.35,
        p_limite: 5000,
      });
      return {
        data: [
          {
            cartografia_seccion_id: 2040,
            seccion_id: 2221,
            CVE_MUN: "001",
            CVEGEO: "15001",
            MUNICIPIO: 1,
            SECCION: 1,
            tipo: 3,
            geometry: {
              type: "Polygon",
              coordinates: [[[-99.9, 19.9], [-99.8, 19.9], [-99.9, 19.9]]],
            },
          },
        ],
        error: null,
      };
    };

    const result = await getVersionedSections(invoke, {
      versionId: 4025,
      minLon: -100.75,
      minLat: 18.3,
      maxLon: -98.5,
      maxLat: 20.35,
      municipio: "001",
      limit: 5000,
    });

    assert.equal(result.type, "FeatureCollection");
    assert.equal(result.features.length, 1);
    assert.deepEqual(result.features[0], {
      type: "Feature",
      id: 2040,
      geometry: {
        type: "Polygon",
        coordinates: [[[-99.9, 19.9], [-99.8, 19.9], [-99.9, 19.9]]],
      },
      properties: {
        cartografia_version_id: 4025,
        cartografia_seccion_id: 2040,
        seccion_id: 2221,
        CVE_MUN: "001",
        CVEGEO: "15001",
        MUNICIPIO: 1,
        SECCION: 1,
        tipo: 3,
      },
    });
  });

  it("resolves a coordinate only against the requested version", async () => {
    const resolution = {
      estado: "UNICA",
      cantidad_candidatos: 1,
      version: { cartografia_version_id: 4025, estado: "PUBLICADA" },
      candidatos: [{ numero_seccion: 1, clave_municipio: "001" }],
    };
    const invoke: CartografiaRpcInvoker = async (name, args) => {
      assert.equal(name, "rpc_resolver_territorio_version");
      assert.deepEqual(args, {
        p_latitud: 19.9620938413329,
        p_longitud: -99.8529742035995,
        p_cartografia_version_id: 4025,
      });
      return { data: resolution, error: null };
    };

    assert.deepEqual(
      await resolveVersionedTerritory(invoke, {
        versionId: 4025,
        lat: 19.9620938413329,
        lon: -99.8529742035995,
      }),
      resolution
    );
  });

  it("does not expose database error details to API consumers", async () => {
    const invoke: CartografiaRpcInvoker = async () => ({
      data: null,
      error: { message: "permission denied for secret_table", code: "42501" },
    });

    await assert.rejects(
      () => listCartografiaVersions(invoke),
      (error: unknown) => {
        assert.ok(error instanceof CartografiaGatewayError);
        assert.equal(error.message, "No se pudo consultar la cartografia");
        assert.equal(error.status, 502);
        assert.equal(error.cause?.message, "permission denied for secret_table");
        return true;
      }
    );
  });
});
