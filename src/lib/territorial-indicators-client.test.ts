import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  TerritorialIndicatorsInput,
  TerritorialIndicatorsResponse,
} from "./territorial-indicators-types";
import {
  buildEffectiveTerritorialOverlays,
  buildTerritorialIndicatorsUrl,
  createTerritorialIndicatorsRequestCoordinator,
  getRequiredTerritorialOverlay,
  territorialIndicatorsSelectionKey,
} from "./territorial-indicators-client";

function response(
  level: TerritorialIndicatorsInput["level"],
  versionId: number,
): TerritorialIndicatorsResponse {
  return {
    level,
    versionId,
    nominalSource: null,
    demographicSource: null,
    rows: [],
  };
}

describe("territorial indicator request coordinator", () => {
  it("adds district overlays only while their territorial theme requires them", () => {
    const userOverlays = new Set(["entidad" as const]);
    const required = getRequiredTerritorialOverlay("INDICATOR", "DISTRITO_FEDERAL");
    assert.equal(required, "distrito_federal");
    assert.deepEqual(
      [...buildEffectiveTerritorialOverlays(userOverlays, required)].sort(),
      ["distrito_federal", "entidad"],
    );
    assert.deepEqual(
      [...buildEffectiveTerritorialOverlays(userOverlays, null)],
      ["entidad"],
    );
    assert.equal(getRequiredTerritorialOverlay("POLITICAL", "DISTRITO_FEDERAL"), null);
    assert.equal(getRequiredTerritorialOverlay("INDICATOR", "MUNICIPIO"), null);
  });

  it("builds an allowlisted URL and stable selection key", () => {
    const input = {
      level: "DISTRITO_LOCAL" as const,
      versionId: 4025,
      nominalCutId: 7,
      demographySourceId: null,
      token: "never-forwarded",
    };
    assert.equal(
      buildTerritorialIndicatorsUrl(input),
      "/api/indicadores-territoriales?level=DISTRITO_LOCAL&versionId=4025&nominalCutId=7",
    );
    assert.equal(
      territorialIndicatorsSelectionKey(input),
      "DISTRITO_LOCAL:4025:7:latest",
    );
  });

  it("aborts changed selections and ignores late responses", async () => {
    type Pending = {
      resolve: (value: TerritorialIndicatorsResponse) => void;
      signal: AbortSignal;
    };
    const pending = new Map<string, Pending>();
    const delivered: Array<TerritorialIndicatorsResponse | null> = [];
    const coordinator = createTerritorialIndicatorsRequestCoordinator(
      (key, signal) =>
        new Promise((resolve) => pending.set(key, { resolve, signal })),
      (value) => delivered.push(value),
    );

    const firstInput: TerritorialIndicatorsInput = {
      level: "MUNICIPIO",
      versionId: 4025,
      nominalCutId: null,
      demographySourceId: null,
    };
    const secondInput: TerritorialIndicatorsInput = {
      level: "DISTRITO_FEDERAL",
      versionId: 4026,
      nominalCutId: 8,
      demographySourceId: 9,
    };
    const first = coordinator.select(firstInput);
    const second = coordinator.select(secondInput);
    assert.equal(pending.get("MUNICIPIO:4025:latest:latest")?.signal.aborted, true);
    pending
      .get("DISTRITO_FEDERAL:4026:8:9")
      ?.resolve(response("DISTRITO_FEDERAL", 4026));
    await second;
    pending
      .get("MUNICIPIO:4025:latest:latest")
      ?.resolve(response("MUNICIPIO", 4025));
    await first;

    assert.deepEqual(
      delivered.filter((value) => value !== null).map((value) => [value.level, value.versionId]),
      [["DISTRITO_FEDERAL", 4026]],
    );

    const third = coordinator.select(firstInput);
    coordinator.clear();
    assert.equal(pending.get("MUNICIPIO:4025:latest:latest")?.signal.aborted, true);
    pending
      .get("MUNICIPIO:4025:latest:latest")
      ?.resolve(response("MUNICIPIO", 4025));
    await third;
    assert.equal(delivered.at(-1), null);
  });
});
