import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CartografiaGatewayError,
  CartografiaInputError,
  type CartografiaRpcInvoker,
} from "./cartografia-versionada";
import { runAuthenticatedCartografiaRequest } from "./cartografia-http";

const unusedInvoker: CartografiaRpcInvoker = async () => ({
  data: null,
  error: null,
});

describe("runAuthenticatedCartografiaRequest", () => {
  it("returns 401 without initializing the privileged client", async () => {
    let initialized = false;
    const response = await runAuthenticatedCartografiaRequest({
      authenticate: async () => null,
      createInvoker: () => {
        initialized = true;
        return unusedInvoker;
      },
      execute: async () => ({ ok: true }),
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "No autenticado" });
    assert.equal(initialized, false);
  });

  it("returns a successful JSON response after authentication", async () => {
    const response = await runAuthenticatedCartografiaRequest({
      authenticate: async () => ({ id: "user-1" }),
      createInvoker: () => unusedInvoker,
      execute: async (invoke) => {
        assert.equal(invoke, unusedInvoker);
        return { versionId: 4025 };
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), { versionId: 4025 });
  });

  it("maps validation and gateway failures without leaking database details", async () => {
    const logged: Error[] = [];
    const cases = [
      {
        error: new CartografiaInputError("bbox invalido"),
        status: 400,
        body: { error: "bbox invalido" },
      },
      {
        error: new CartografiaGatewayError(
          new Error("permission denied for secret_table")
        ),
        status: 502,
        body: { error: "No se pudo consultar la cartografia" },
      },
    ];

    for (const testCase of cases) {
      const response = await runAuthenticatedCartografiaRequest({
        authenticate: async () => ({ id: "user-1" }),
        createInvoker: () => unusedInvoker,
        execute: async () => {
          throw testCase.error;
        },
        onError: (error) => logged.push(error),
      });

      assert.equal(response.status, testCase.status);
      assert.deepEqual(await response.json(), testCase.body);
      assert.doesNotMatch(JSON.stringify(testCase.body), /secret_table/);
    }

    assert.equal(logged.length, 1);
    assert.equal(logged[0].message, "permission denied for secret_table");
  });
});

