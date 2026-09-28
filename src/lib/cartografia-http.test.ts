import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createCartografiaSectionsRoute } from "./cartografia-http";
import type { CartografiaRpcInvoker } from "./cartografia-versionada";

describe("cartography sections route", () => {
  it("does not initialize privileged access for anonymous users", async () => {
    let initialized = false;
    const GET = createCartografiaSectionsRoute({
      authenticate: async () => null,
      createInvoker: () => {
        initialized = true;
        return async () => ({ data: [], error: null });
      },
    });

    const response = await GET(
      new Request(
        "http://localhost/api/cartografia/secciones?versionId=4025&minLon=-100.75&minLat=18.3&maxLon=-98.5&maxLat=20.35&municipio=001&limit=5000"
      )
    );

    assert.equal(response.status, 401);
    assert.equal(initialized, false);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  });

  it("returns version-tagged sections through the allowlisted RPC", async () => {
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
    const GET = createCartografiaSectionsRoute({
      authenticate: async () => ({ id: "user-1" }),
      createInvoker: () => invoke,
    });

    const response = await GET(
      new Request(
        "http://localhost/api/cartografia/secciones?versionId=4025&minLon=-100.75&minLat=18.3&maxLon=-98.5&maxLat=20.35&municipio=001&limit=5000&table=secret"
      )
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(body.features[0].properties.seccion_id, 2221);
    assert.equal(body.features[0].properties.cartografia_version_id, 4025);
  });

  it("maps malformed bounds to 400 without exposing internals", async () => {
    const GET = createCartografiaSectionsRoute({
      authenticate: async () => ({ id: "user-1" }),
      createInvoker: () => async () => ({ data: [], error: null }),
    });

    const response = await GET(
      new Request(
        "http://localhost/api/cartografia/secciones?versionId=4025&minLon=-98&minLat=18.3&maxLon=-100&maxLat=20.35&municipio=001"
      )
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "rango de longitud invalido" });
  });
});
