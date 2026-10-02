import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createTerritorialIndicatorsRoute,
  runAuthenticatedTerritorialIndicatorsRequest,
} from "./territorial-indicators-http";
import {
  TerritorialIndicatorsGatewayError,
  TerritorialIndicatorsInputError,
  type TerritorialIndicatorsRpcInvoker,
} from "./territorial-indicators-versioned";

const unusedInvoker: TerritorialIndicatorsRpcInvoker = async () => ({
  data: [],
  error: null,
});

describe("runAuthenticatedTerritorialIndicatorsRequest", () => {
  it("returns 401 before initializing the privileged client", async () => {
    let initialized = false;
    const response = await runAuthenticatedTerritorialIndicatorsRequest({
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

  it("contains authentication failures without initializing the privileged client", async () => {
    let initialized = false;
    let reported = "";
    const response = await runAuthenticatedTerritorialIndicatorsRequest({
      authenticate: async () => {
        throw new Error("auth provider secret");
      },
      createInvoker: () => {
        initialized = true;
        return unusedInvoker;
      },
      execute: async () => ({ ok: true }),
      onError: (error) => {
        reported = error.message;
      },
    });
    assert.equal(response.status, 500);
    assert.equal(initialized, false);
    assert.equal(reported, "auth provider secret");
    assert.deepEqual(await response.json(), {
      error: "Error interno al consultar indicadores territoriales",
    });
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  });

  it("maps validation, gateway and unknown failures without leaking internals", async () => {
    const cases = [
      [new TerritorialIndicatorsInputError("level inválido"), 400, "level inválido"],
      [
        new TerritorialIndicatorsGatewayError(new Error("secret_table leaked")),
        502,
        "No se pudieron consultar los indicadores territoriales",
      ],
      [new Error("internal secret"), 500, "Error interno al consultar indicadores territoriales"],
    ] as const;
    for (const [error, status, message] of cases) {
      const response = await runAuthenticatedTerritorialIndicatorsRequest({
        authenticate: async () => ({ id: "user-1" }),
        createInvoker: () => unusedInvoker,
        execute: async () => {
          throw error;
        },
        onError: () => undefined,
      });
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), { error: message });
      assert.doesNotMatch(message, /secret|table/i);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
    }
  });
});

it("route forwards only allowlisted territorial indicator inputs", async () => {
  const invoke: TerritorialIndicatorsRpcInvoker = async (name, args) => {
    assert.equal(name, "rpc_indicadores_territoriales");
    assert.deepEqual(args, {
      p_nivel: "DISTRITO_LOCAL",
      p_cartografia_version_id: 4025,
      p_lista_nominal_corte_id: 7,
      p_demografia_fuente_id: 9,
    });
    return { data: [], error: null };
  };
  const GET = createTerritorialIndicatorsRoute({
    authenticate: async () => ({ id: "user-1" }),
    createInvoker: () => invoke,
  });
  const response = await GET(
    new Request(
      "http://localhost/api/indicadores-territoriales?level=DISTRITO_LOCAL&versionId=4025&nominalCutId=7&demographySourceId=9&rpc=secret&token=secret",
    ),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});
