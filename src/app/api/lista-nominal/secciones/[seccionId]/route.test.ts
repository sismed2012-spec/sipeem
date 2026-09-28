import assert from "node:assert/strict";
import { it } from "node:test";

import { createListaNominalSectionRoute } from "../../../../../lib/lista-nominal-http";
import type { ListaNominalRpcInvoker } from "../../../../../lib/lista-nominal-versionada";

it("awaits params and forwards only controlled nominal-list inputs", async () => {
  const invoke: ListaNominalRpcInvoker = async (name, args) => {
    assert.equal(name, "rpc_lista_nominal_seccion");
    assert.deepEqual(args, {
      p_seccion_id: 2221,
      p_cartografia_version_id: 4025,
      p_fecha_corte: "2026-07-31",
    });
    return { data: [], error: null };
  };
  const GET = createListaNominalSectionRoute({
    authenticate: async () => ({ id: "user-1" }),
    createInvoker: () => invoke,
  });
  const response = await GET(
    new Request(
      "http://localhost/api/lista-nominal/secciones/2221?versionId=4025&cutoffDate=2026-07-31&rpc=secret",
    ),
    { params: Promise.resolve({ seccionId: "2221" }) },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal((await response.json()).status, "UNAVAILABLE");
});

it("returns 400 when versionId is missing", async () => {
  const GET = createListaNominalSectionRoute({
    authenticate: async () => ({ id: "user-1" }),
    createInvoker: () => async () => ({ data: [], error: null }),
  });
  const response = await GET(
    new Request("http://localhost/api/lista-nominal/secciones/2221"),
    { params: Promise.resolve({ seccionId: "2221" }) },
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "versionId es obligatorio" });
});
