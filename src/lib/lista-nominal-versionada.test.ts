import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ListaNominalGatewayError,
  ListaNominalInputError,
  getVersionedNominalList,
  parseListaNominalSectionParams,
  type ListaNominalRpcInvoker,
} from "./lista-nominal-versionada";

const input = { sectionId: 2221, versionId: 4025, cutoffDate: null };

function availableRow() {
  return {
    section_id: 2221,
    version_id: 4025,
    cutoff_date: "2026-07-31",
    source: {
      provider: "INE",
      fileName: "S.xlsx",
      sha256: "a".repeat(64),
    },
    status: "AVAILABLE",
    padron: { men: 80, women: 100, nonBinary: 0, total: 180 },
    nominal: { men: 78, women: 99, nonBinary: 0, total: 177 },
    difference: 3,
    coverage: (177 / 180) * 100,
  };
}

describe("parseListaNominalSectionParams", () => {
  it("accepts positive IDs and an optional real ISO date", () => {
    assert.deepEqual(
      parseListaNominalSectionParams(
        "2221",
        new URLSearchParams("versionId=4025&cutoffDate=2026-07-31"),
      ),
      { sectionId: 2221, versionId: 4025, cutoffDate: "2026-07-31" },
    );
    assert.equal(
      parseListaNominalSectionParams(
        "2221",
        new URLSearchParams("versionId=4025"),
      ).cutoffDate,
      null,
    );
  });

  it("rejects invalid IDs and non-allowlisted dates", () => {
    for (const [section, query] of [
      ["0", "versionId=4025"],
      ["1.2", "versionId=4025"],
      ["2221", "versionId=0"],
      ["2221", "versionId=4025&cutoffDate=31-07-2026"],
      ["2221", "versionId=4025&cutoffDate=2026-02-30"],
    ]) {
      assert.throws(
        () => parseListaNominalSectionParams(section, new URLSearchParams(query)),
        ListaNominalInputError,
      );
    }
  });
});

describe("getVersionedNominalList", () => {
  it("invokes exactly the fixed RPC and normalizes its response", async () => {
    const invoke: ListaNominalRpcInvoker = async (name, args) => {
      assert.equal(name, "rpc_lista_nominal_seccion");
      assert.deepEqual(args, {
        p_seccion_id: 2221,
        p_cartografia_version_id: 4025,
        p_fecha_corte: null,
      });
      return { data: [availableRow()], error: null };
    };
    const result = await getVersionedNominalList(invoke, input);
    assert.equal(result.status, "AVAILABLE");
    assert.equal(result.nominal?.total, 177);
    assert.equal(result.padron?.total, 180);
    assert.equal(result.cutoffDate, "2026-07-31");
  });

  it("returns UNAVAILABLE with null metrics when the RPC returns no row", async () => {
    const result = await getVersionedNominalList(
      async () => ({ data: [], error: null }),
      input,
    );
    assert.deepEqual(result, {
      sectionId: 2221,
      versionId: 4025,
      cutoffDate: null,
      source: null,
      status: "UNAVAILABLE",
      padron: null,
      nominal: null,
      difference: null,
      coverage: null,
    });
  });

  it("rejects malformed identities and arithmetic", async () => {
    for (const row of [
      { ...availableRow(), section_id: 999 },
      { ...availableRow(), nominal: { men: 78, women: 99, nonBinary: 0, total: 176 } },
      { ...availableRow(), difference: 4 },
      { ...availableRow(), coverage: 120 },
    ]) {
      await assert.rejects(
        getVersionedNominalList(
          async () => ({ data: [row], error: null }),
          input,
        ),
        ListaNominalGatewayError,
      );
    }
  });

  it("sanitizes database failures", async () => {
    await assert.rejects(
      getVersionedNominalList(
        async () => ({ data: null, error: { message: "secret_table leaked" } }),
        input,
      ),
      (error: unknown) =>
        error instanceof ListaNominalGatewayError &&
        error.message === "No se pudo consultar la lista nominal" &&
        !error.message.includes("secret_table"),
    );
  });
});
