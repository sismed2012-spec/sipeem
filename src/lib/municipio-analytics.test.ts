import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getTimelineSpotlightEvents,
  mergeMunicipioTimelineEvents,
} from "./municipio-analytics";

describe("mergeMunicipioTimelineEvents", () => {
  it("injects a 2023 gubernatura event in descending chronology without dropping municipal years", () => {
    const result = mergeMunicipioTimelineEvents({
      municipal: [
        {
          id: 10,
          anio: 2024,
          winner: "PVEM_PT_MORENA",
          winnerSiglas: "PVEM_PT_MORENA",
          winnerColor: "#166534",
          votos: 13559,
          porcentaje: 43.51,
          margin: 5031,
          source: "oficial_municipal",
          electionType: "municipal",
          topParties: [],
        },
        {
          id: 8,
          anio: 2021,
          winner: "PRI",
          winnerSiglas: "PRI",
          winnerColor: "#dc2626",
          votos: 9866,
          porcentaje: 32.66,
          margin: 1116,
          source: "oficial_municipal",
          electionType: "municipal",
          topParties: [],
        },
      ],
      gubernatura2023: {
        id: 99,
        anio: 2023,
        winner: "MORENA",
        winnerSiglas: "MORENA",
        winnerColor: "#7f1d1d",
        votos: 12000,
        porcentaje: 41.2,
        margin: 850,
        source: "gubernatura_seccional",
        electionType: "gubernatura",
        topParties: [],
      },
    });

    assert.deepEqual(
      result.map((event) => [event.anio, event.electionType, event.source]),
      [
        [2024, "municipal", "oficial_municipal"],
        [2023, "gubernatura", "gubernatura_seccional"],
        [2021, "municipal", "oficial_municipal"],
      ]
    );
    assert.equal(result.length, 3);
  });
});

describe("getTimelineSpotlightEvents", () => {
  it("returns all events sorted from newest to oldest", () => {
    const events = getTimelineSpotlightEvents([
      { anio: 2018 } as never,
      { anio: 2024 } as never,
      { anio: 2021 } as never,
      { anio: 2023 } as never,
    ]);

    assert.deepEqual(
      events.map((event) => event.anio),
      [2024, 2023, 2021, 2018]
    );
    assert.equal(events.length, 4);
  });
});
