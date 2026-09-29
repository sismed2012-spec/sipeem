import assert from "node:assert/strict";
import { it } from "node:test";

import { createTerritorialIndicatorsRoute } from "../../../lib/territorial-indicators-http";

it("returns 400 for a missing versionId", async () => {
  const GET = createTerritorialIndicatorsRoute({
    authenticate: async () => ({ id: "user-1" }),
    createInvoker: () => async () => ({ data: [], error: null }),
  });
  const response = await GET(
    new Request(
      "http://localhost/api/indicadores-territoriales?level=MUNICIPIO",
    ),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "versionId es obligatorio" });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});
