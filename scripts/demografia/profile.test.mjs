import assert from "node:assert/strict";
import test from "node:test";

import { assertExpectedIterProfile, buildIterProfile } from "./profile.mjs";

function row(overrides) {
  return {
    ENTIDAD: "15",
    MUN: "001",
    LOC: "0001",
    LONGITUD: `99°50'38.515" W`,
    LATITUD: `19°57'22.423" N`,
    POBTOT: "10",
    POBFEM: "*",
    ...overrides,
  };
}

test("buildIterProfile reconciles row classes and keeps reserved cells visible", () => {
  const profile = buildIterProfile({
    headers: Array.from({ length: 286 }, (_, index) => `C${index}`),
    rows: [
      row({ MUN: "000", LOC: "0000", POBTOT: "30" }),
      row({ MUN: "001", LOC: "0000", POBTOT: "30" }),
      row({ LOC: "0001", POBTOT: "10" }),
      row({ LOC: "0002", POBTOT: "20" }),
      row({ LOC: "9998", POBTOT: "1" }),
    ],
  });

  assert.deepEqual(profile, {
    totalRows: 5,
    columnCount: 286,
    stateTotals: 1,
    municipalityTotals: 1,
    realLocalities: 2,
    specialRows: 1,
    totalPopulation: 30,
    reservedCellCount: 5,
    duplicateLocalityKeys: [],
    missingCoordinateRows: [],
  });
});

test("buildIterProfile reports duplicate real-locality keys", () => {
  const duplicate = row({ LOC: "0001" });
  const profile = buildIterProfile({ headers: [], rows: [duplicate, { ...duplicate }] });

  assert.deepEqual(profile.duplicateLocalityKeys, ["15-001-0001"]);
});

test("buildIterProfile reports missing coordinates only for real localities", () => {
  const profile = buildIterProfile({
    headers: [],
    rows: [
      row({ LOC: "0001", LONGITUD: "" }),
      row({ LOC: "0000", LONGITUD: "", LATITUD: "" }),
    ],
  });

  assert.deepEqual(profile.missingCoordinateRows, ["15-001-0001"]);
});

test("assertExpectedIterProfile blocks an unexpected source before any write", () => {
  const valid = {
    totalRows: 5136,
    columnCount: 286,
    stateTotals: 1,
    municipalityTotals: 125,
    realLocalities: 4894,
    specialRows: 116,
    totalPopulation: 16992418,
    duplicateLocalityKeys: [],
    missingCoordinateRows: [],
  };

  assert.doesNotThrow(() => assertExpectedIterProfile(valid));
  assert.throws(
    () => assertExpectedIterProfile({ ...valid, totalPopulation: 1 }),
    /totalPopulation: expected 16992418, received 1/
  );
});
