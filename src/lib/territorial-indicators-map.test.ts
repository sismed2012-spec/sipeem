import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  TerritorialIndicatorRow,
  TerritorialLevel,
} from "./territorial-indicators-types";
import {
  NO_DATA_COLOR,
  buildQuantileScale,
  buildTerritorialIndicatorIndex,
  formatTerritorialMetric,
  getIndicatorFill,
  resolveTerritoryIndicator,
} from "./territorial-indicators-map";

function row(
  level: TerritorialLevel,
  territoryId: number,
  cartographyTerritoryId: number,
  key: string,
): TerritorialIndicatorRow {
  return {
    level,
    territoryId,
    cartographyTerritoryId,
    key,
    name: `Territorio ${key}`,
    totalSections: 1,
    nominalSections: 1,
    demographicSections: 1,
    nominalSourceCoveragePercent: 100,
    demographicSourceCoveragePercent: 100,
    metricQuality: {
      poblacionTotal: 1,
      poblacionFemenina: 1,
      poblacionMasculina: 1,
      poblacion0a14: 1,
      poblacion15a64: 1,
      poblacion65Mas: 1,
      poblacion18Mas: 1,
      pea: 1,
      poblacionOcupada: 1,
      poblacion15MasAnalfabeta: 1,
      poblacionDerechohabienteSalud: 1,
      poblacionConDiscapacidad: 1,
      poblacion3MasHablanteLenguaIndigena: 1,
      poblacionAfrodescendiente: 1,
      viviendasHabitadas: 1,
      viviendasConAgua: 1,
      viviendasConDrenaje: 1,
      viviendasConElectricidad: 1,
      viviendasConCelular: 1,
      viviendasConComputadora: 1,
      viviendasConInternet: 1,
    },
    metrics: {
      padronHombres: 1,
      padronMujeres: 1,
      padronNoBinario: 0,
      padronTotal: 2,
      listaNominalHombres: 1,
      listaNominalMujeres: 1,
      listaNominalNoBinario: 0,
      listaNominalTotal: 2,
      diferencia: 0,
      coberturaPadronPct: 100,
      poblacionTotal: 10,
      poblacionFemenina: 5,
      poblacionMasculina: 5,
      poblacion0a14: 2,
      poblacion15a64: 7,
      poblacion65Mas: 1,
      poblacion18Mas: 7,
      pea: 4,
      poblacionOcupada: 3,
      poblacion15MasAnalfabeta: 0,
      poblacionDerechohabienteSalud: 8,
      poblacionConDiscapacidad: 1,
      poblacion3MasHablanteLenguaIndigena: 0,
      poblacionAfrodescendiente: 0,
      viviendasHabitadas: 3,
      viviendasConAgua: 3,
      viviendasConDrenaje: 3,
      viviendasConElectricidad: 3,
      viviendasConCelular: 3,
      viviendasConComputadora: 2,
      viviendasConInternet: 2,
    },
  };
}

describe("territorial geometry identity", () => {
  it("indexes and resolves municipalities by versioned ID, CVE_MUN or CVEGEO", () => {
    const target = row("MUNICIPIO", 1, 101, "001");
    const index = buildTerritorialIndicatorIndex([target]);
    assert.equal(index.byCartographyId.get(101), target);
    assert.equal(index.byKey.get("001"), target);
    for (const properties of [
      { cartografia_municipio_id: 101 },
      { CVE_MUN: "1" },
      { CVEGEO: "15001" },
    ]) {
      assert.equal(resolveTerritoryIndicator("MUNICIPIO", properties, index), target);
    }
    assert.equal(
      resolveTerritoryIndicator(
        "MUNICIPIO",
        { CVE_MUN: "001", CVEGEO: "15002" },
        index,
      ),
      null,
    );
  });

  it("resolves local and federal districts through their allowlisted fields", () => {
    const local = row("DISTRITO_LOCAL", 1, 201, "001");
    const federal = row("DISTRITO_FEDERAL", 1, 301, "001");
    const localIndex = buildTerritorialIndicatorIndex([local]);
    const federalIndex = buildTerritorialIndicatorIndex([federal]);
    for (const properties of [
      { cartografia_distrito_local_id: 201 },
      { DISTRITO_L: "01" },
      { CVE_DTO_LOC: 1 },
      { DTO_LOC: "1" },
      { DISTRITO: "001" },
    ]) {
      assert.equal(resolveTerritoryIndicator("DISTRITO_LOCAL", properties, localIndex), local);
    }
    for (const properties of [
      { cartografia_distrito_federal_id: 301 },
      { DISTRITO_F: "01" },
      { CVE_DTO_FED: 1 },
      { DTO_FED: "1" },
      { DISTRITO: "001" },
    ]) {
      assert.equal(
        resolveTerritoryIndicator("DISTRITO_FEDERAL", properties, federalIndex),
        federal,
      );
    }
    assert.equal(
      resolveTerritoryIndicator(
        "DISTRITO_LOCAL",
        { DISTRITO_L: 1, DTO_LOC: 2 },
        localIndex,
      ),
      null,
    );
  });
});

describe("territorial quantile scale", () => {
  it("ignores nulls, creates at most five bins and reduces tied boundaries", () => {
    const scale = buildQuantileScale([null, 0, 1, 1, 2, 3, 4, 5, 6, 7]);
    assert.equal(scale.bins.length, 5);
    assert.deepEqual(
      scale.bins.map((bin) => bin.color),
      ["#eff6ff", "#bfdbfe", "#60a5fa", "#2563eb", "#1e3a8a"],
    );
    assert.ok(new Set(scale.bins.map((bin) => bin.upper)).size === scale.bins.length);
    const tied = buildQuantileScale([1, 1, 1, 1, 2]);
    assert.equal(tied.bins.length, 2);
    assert.deepEqual(buildQuantileScale([null, null]).bins, []);
  });

  it("colors zero while keeping null as Sin dato gray", () => {
    const scale = buildQuantileScale([0, 10]);
    assert.notEqual(getIndicatorFill(0, scale), NO_DATA_COLOR);
    assert.equal(getIndicatorFill(null, scale), "#94a3b8");
  });

  it("formats es-MX counts, percentages and missing values", () => {
    assert.equal(formatTerritorialMetric(1234567, "poblacionTotal"), "1,234,567");
    assert.match(formatTerritorialMetric(94.456, "coberturaPadronPct"), /^94\.46\s?%$/);
    assert.equal(formatTerritorialMetric(null, "pea"), "Sin dato");
    assert.equal(formatTerritorialMetric(0, "pea"), "0");
  });
});
