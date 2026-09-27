import assert from "node:assert/strict";
import { it } from "node:test";

import { createDemografiaSectionRoute } from "../../../../../lib/demografia-http";
import type { DemografiaRpcInvoker } from "../../../../../lib/demografia-versionada";

it("dynamic section route awaits params and accepts only the controlled query", async () => {
  const invoke: DemografiaRpcInvoker = async (name, args) => {
    assert.equal(name, "rpc_demografia_seccion");
    assert.deepEqual(args, {
      p_seccion_id: 2221,
      p_cartografia_version_id: 4025,
      p_anio_censal: 2020,
    });
    return { data: [], error: null };
  };
  const GET = createDemografiaSectionRoute({
    authenticate: async () => ({ id: "user-1" }),
    createInvoker: () => invoke,
  });
  const response = await GET(
    new Request("http://localhost/api/demografia/secciones/2221?versionId=4025&censusYear=2020&table=secret"),
    { params: Promise.resolve({ seccionId: "2221" }) }
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal((await response.json()).status, "UNAVAILABLE");
});

it("dynamic section route returns 400 when versionId is missing", async () => {
  const GET = createDemografiaSectionRoute({
    authenticate: async () => ({ id: "user-1" }),
    createInvoker: () => async () => ({ data: [], error: null }),
  });
  const response = await GET(
    new Request("http://localhost/api/demografia/secciones/2221"),
    { params: Promise.resolve({ seccionId: "2221" }) }
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "versionId es obligatorio" });
});
