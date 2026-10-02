import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createDemografiaReviewRoute,
  runAuthorizedDemografiaReviewRequest,
} from "./demografia-review-http";
import type { DemografiaReviewRpcInvoker } from "./demografia-review";

const emptyResponse = {
  selectedVersion: { id: 4025, key: "V1", state: "PUBLICADA", isDefault: true },
  versions: [{ id: 4025, key: "V1", state: "PUBLICADA", isDefault: true }],
  source: { id: 1, provider: "INEGI", datasetKey: "CPV2020_ITER", censusYear: 2020 },
  summary: { totalPending: 0, multisection: 0, manualReview: 0, unmatched: 0 },
  municipalities: [],
  items: [],
  pagination: { offset: 0, limit: 50, total: 0, hasMore: false },
};

const invoke: DemografiaReviewRpcInvoker = async () => ({
  data: emptyResponse,
  error: null,
});

describe("runAuthorizedDemografiaReviewRequest", () => {
  it("does not initialize privileged access for anonymous or operator users", async () => {
    for (const user of [null, { id: "u1", rol: "operador" }]) {
      let initialized = false;
      const response = await runAuthorizedDemografiaReviewRequest({
        authenticate: async () => user,
        createInvoker: () => {
          initialized = true;
          return invoke;
        },
        execute: async () => emptyResponse,
      });

      assert.equal(response.status, user ? 403 : 401);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(initialized, false);
    }
  });
});

it("review route ignores unknown query parameters and stays read-only", async () => {
  const GET = createDemografiaReviewRoute({
    authenticate: async () => ({ id: "u1", rol: "admin" }),
    createInvoker: () => invoke,
  });
  const response = await GET(
    new Request("http://localhost/api/demografia/revision?versionId=4025&table=secret")
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal((await response.json()).selectedVersion.id, 4025);
});
