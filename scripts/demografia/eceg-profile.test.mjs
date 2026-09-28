import assert from "node:assert/strict";
import test from "node:test";

import {
  assertExpectedEcegProfile,
  buildEcegProfile,
} from "./eceg-profile.mjs";

function section(sectionNumber, municipalityCode, district, population, extra = {}) {
  return {
    geography: {
      entityCode: "15",
      entityName: "México",
      district,
      complexityGroup: "Disperso 1",
      municipalityCode,
      municipalityName: `Municipio ${municipalityCode}`,
      sectionNumber,
    },
    indicators: {
      poblacion_poblacion_total: population,
      fecundidad_promedio: { value: 2.1, status: "PRESENTE" },
      ...extra,
    },
  };
}

test("buildEcegProfile reconciles sections, dimensions and data states", () => {
  const parsed = {
    indicators: [
      { id: "poblacion_poblacion_total" },
      { id: "fecundidad_promedio" },
    ],
    sections: [
      section("0001", "001", "001", { value: 10, status: "PRESENTE" }),
      section("0002", "001", "002", { value: 0, status: "PRESENTE" }, {
        fecundidad_promedio: { value: null, status: "RESERVADO" },
      }),
      section("0003", "002", "002", { value: 20, status: "PRESENTE" }, {
        fecundidad_promedio: { value: null, status: "AUSENTE" },
      }),
    ],
  };

  assert.deepEqual(buildEcegProfile(parsed), {
    sectionCount: 3,
    indicatorCount: 2,
    municipalityCount: 2,
    districtCount: 2,
    totalPopulation: 30,
    presentCellCount: 4,
    reservedCellCount: 1,
    absentCellCount: 1,
    zeroValueCount: 1,
    sectionsMissingPopulation: [],
    sectionsWithUnexpectedIndicatorCount: [],
  });
});

test("buildEcegProfile reports missing population and incomplete sections", () => {
  const parsed = {
    indicators: [
      { id: "poblacion_poblacion_total" },
      { id: "fecundidad_promedio" },
    ],
    sections: [
      section("0001", "001", "001", { value: null, status: "RESERVADO" }),
      {
        ...section("0002", "001", "001", { value: 5, status: "PRESENTE" }),
        indicators: {
          poblacion_poblacion_total: { value: 5, status: "PRESENTE" },
        },
      },
    ],
  };
  const profile = buildEcegProfile(parsed);

  assert.deepEqual(profile.sectionsMissingPopulation, ["0001"]);
  assert.deepEqual(profile.sectionsWithUnexpectedIndicatorCount, ["0002"]);
});

test("assertExpectedEcegProfile blocks any reconciliation mismatch", () => {
  const valid = {
    sectionCount: 6544,
    indicatorCount: 220,
    municipalityCount: 125,
    districtCount: 41,
    totalPopulation: 16992418,
    sectionsMissingPopulation: [],
    sectionsWithUnexpectedIndicatorCount: [],
  };

  assert.doesNotThrow(() => assertExpectedEcegProfile(valid));
  assert.throws(
    () => assertExpectedEcegProfile({ ...valid, sectionCount: 6543 }),
    /sectionCount: expected 6544, received 6543/
  );
  assert.throws(
    () => assertExpectedEcegProfile({ ...valid, sectionsMissingPopulation: ["0001"] }),
    /sectionsMissingPopulation: expected none, received 1/
  );
});
