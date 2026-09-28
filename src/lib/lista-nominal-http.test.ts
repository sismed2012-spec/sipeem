import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runAuthenticatedListaNominalRequest } from "./lista-nominal-http";
import {
  ListaNominalGatewayError,
  ListaNominalInputError,
  type ListaNominalRpcInvoker,
} from "./lista-nominal-versionada";

const unusedInvoker: ListaNominalRpcInvoker = async () => ({ data: [], error: null });

describe("runAuthenticatedListaNominalRequest", () => {
  it("returns 401 before initializing the privileged client", async () => {
    let initialized = false;
    const response = await runAuthenticatedListaNominalRequest({
      authenticate: async () => null,
      createInvoker: () => {
        initialized = true;
        return unusedInvoker;
      },
      execute: async () => ({ ok: true }),
    });
    assert.equal(response.status, 401);
    assert.equal(initialized, false);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  });

  it("returns private/no-store JSON for authenticated requests", async () => {
    const response = await runAuthenticatedListaNominalRequest({
      authenticate: async () => ({ id: "user-1" }),
      createInvoker: () => unusedInvoker,
      execute: async () => ({ status: "UNAVAILABLE" }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), { status: "UNAVAILABLE" });
  });

  it("maps validation and gateway errors without leaking details", async () => {
    const logged: Error[] = [];
    for (const [error, status, message] of [
      [new ListaNominalInputError("versionId es obligatorio"), 400, "versionId es obligatorio"],
      [
        new ListaNominalGatewayError(new Error("secret_table leaked")),
        502,
        "No se pudo consultar la lista nominal",
      ],
    ] as const) {
      const response = await runAuthenticatedListaNominalRequest({
        authenticate: async () => ({ id: "user-1" }),
        createInvoker: () => unusedInvoker,
        execute: async () => {
          throw error;
        },
        onError: (value) => logged.push(value),
      });
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), { error: message });
      assert.doesNotMatch(message, /secret_table/);
    }
    assert.equal(logged.length, 1);
    assert.equal(logged[0].message, "secret_table leaked");
  });
});
