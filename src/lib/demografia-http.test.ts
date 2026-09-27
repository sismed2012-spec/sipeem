import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DemografiaGatewayError,
  DemografiaInputError,
  type DemografiaRpcInvoker,
} from "./demografia-versionada";
import { runAuthenticatedDemografiaRequest } from "./demografia-http";

const unusedInvoker: DemografiaRpcInvoker = async () => ({ data: [], error: null });

describe("runAuthenticatedDemografiaRequest", () => {
  it("returns 401 without initializing the privileged client", async () => {
    let initialized = false;
    const response = await runAuthenticatedDemografiaRequest({
      authenticate: async () => null,
      createInvoker: () => { initialized = true; return unusedInvoker; },
      execute: async () => ({ ok: true }),
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "No autenticado" });
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(initialized, false);
  });

  it("returns successful private/no-store JSON after authentication", async () => {
    const response = await runAuthenticatedDemografiaRequest({
      authenticate: async () => ({ id: "user-1" }),
      createInvoker: () => unusedInvoker,
      execute: async () => ({ status: "UNAVAILABLE" }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), { status: "UNAVAILABLE" });
  });

  it("maps validation and gateway errors without exposing database details", async () => {
    const logged: Error[] = [];
    const cases = [
      [new DemografiaInputError("versionId es obligatorio"), 400, "versionId es obligatorio"],
      [new DemografiaGatewayError(new Error("secret_table leaked")), 502, "No se pudo consultar la demografia"],
    ] as const;

    for (const [error, status, message] of cases) {
      const response = await runAuthenticatedDemografiaRequest({
        authenticate: async () => ({ id: "user-1" }),
        createInvoker: () => unusedInvoker,
        execute: async () => { throw error; },
        onError: (value) => logged.push(value),
      });
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), { error: message });
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.doesNotMatch(message, /secret_table/);
    }
    assert.equal(logged.length, 1);
    assert.equal(logged[0].message, "secret_table leaked");
  });
});
