import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ListaNominalSeccionResponse } from "./lista-nominal-types";
import {
  createListaNominalRequestCoordinator,
  listaNominalSelectionKey,
} from "./lista-nominal-client";

function response(
  sectionId: number,
  versionId: number,
): ListaNominalSeccionResponse {
  return {
    sectionId,
    versionId,
    cutoffDate: "2026-07-31",
    source: { provider: "INE", fileName: "S.xlsx", sha256: "a".repeat(64) },
    status: "AVAILABLE",
    padron: { men: 8, women: 10, nonBinary: 0, total: 18 },
    nominal: { men: 8, women: 9, nonBinary: 0, total: 17 },
    difference: 1,
    coverage: (17 / 18) * 100,
  };
}

describe("nominal-list request coordinator", () => {
  it("isolates request keys by section, version and cutoff", () => {
    assert.equal(
      listaNominalSelectionKey({
        sectionId: 1,
        versionId: 4025,
        cutoffDate: null,
      }),
      "1:4025:latest",
    );
    assert.equal(
      listaNominalSelectionKey({
        sectionId: 1,
        versionId: 4025,
        cutoffDate: "2026-07-31",
      }),
      "1:4025:2026-07-31",
    );
  });

  it("aborts stale selections and ignores their late responses", async () => {
    type Pending = {
      resolve: (value: ListaNominalSeccionResponse) => void;
      signal: AbortSignal;
    };
    const pending = new Map<string, Pending>();
    const delivered: Array<ListaNominalSeccionResponse | null> = [];
    const coordinator = createListaNominalRequestCoordinator(
      (key, signal) =>
        new Promise((resolve) => pending.set(key, { resolve, signal })),
      (value) => delivered.push(value),
    );

    const first = coordinator.select({
      sectionId: 101,
      versionId: 4025,
      cutoffDate: null,
    });
    const second = coordinator.select({
      sectionId: 102,
      versionId: 4026,
      cutoffDate: "2026-07-31",
    });
    assert.equal(pending.get("101:4025:latest")?.signal.aborted, true);
    pending.get("102:4026:2026-07-31")?.resolve(response(102, 4026));
    await second;
    pending.get("101:4025:latest")?.resolve(response(101, 4025));
    await first;

    assert.deepEqual(
      delivered
        .filter((value): value is ListaNominalSeccionResponse => value !== null)
        .map((value) => [value.sectionId, value.versionId]),
      [[102, 4026]],
    );

    const third = coordinator.select({
      sectionId: 103,
      versionId: 4025,
      cutoffDate: null,
    });
    coordinator.clear();
    assert.equal(pending.get("103:4025:latest")?.signal.aborted, true);
    pending.get("103:4025:latest")?.resolve(response(103, 4025));
    await third;
    assert.equal(delivered.at(-1), null);
  });
});
