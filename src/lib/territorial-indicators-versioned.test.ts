import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TerritorialIndicatorsGatewayError,
  TerritorialIndicatorsInputError,
  getTerritorialIndicators,
  parseTerritorialIndicatorParams,
  type TerritorialIndicatorsRpcInvoker,
} from "./territorial-indicators-versioned";

const input = {
  level: "MUNICIPIO" as const,
  versionId: 4025,
  nominalCutId: null,
  demographySourceId: null,
};

function rpcRow(overrides: Record<string, unknown> = {}) {
  return {
    nivel: "MUNICIPIO",
    territorio_id: 1,
    cartografia_territorio_id: 10,
    clave: "001",
    nombre: "Acambay",
    cartografia_version_id: 4025,
    lista_nominal_corte_id: 7,
    lista_nominal_fecha_corte: "2026-07-31",
    demografia_fuente_id: 9,
    demografia_anio_censal: 2020,
    secciones_total: 2,
    secciones_nominal: 1,
    secciones_demografia: 1,
    cobertura_fuente_nominal_pct: 50,
    cobertura_fuente_demografia_pct: 50,
    padron_hombres: 10,
    padron_mujeres: 8,
    padron_no_binario: 0,
    padron_total: 18,
    lista_hombres: 9,
    lista_mujeres: 8,
    lista_no_binario: 0,
    lista_total: 17,
    diferencia: 1,
    cobertura_padron_pct: 94.44444444,
    pobtot: 100,
    pobfem: 52,
    pobmas: 48,
    pob0_14: null,
    pob15_64: null,
    pob65_mas: null,
    p_18ymas: null,
    pea: 0,
    pocupada: null,
    p15ym_an: null,
    pder_ss: null,
    pcon_disc: null,
    p3ym_hli: null,
    pob_afro: null,
    tvivhab: 30,
    vph_aguadv: null,
    vph_drenaj: null,
    vph_c_elec: null,
    vph_cel: null,
    vph_pc: null,
    vph_inter: 12,
    calidad_metricas: {
      pobtot: 1,
      pobfem: 1,
      pobmas: 1,
      pob0_14: 0,
      pob15_64: 0,
      pob65_mas: 0,
      p_18ymas: 0,
      pea: 1,
      pocupada: 0,
      p15ym_an: 0,
      pder_ss: 0,
      pcon_disc: 0,
      p3ym_hli: 0,
      pob_afro: 0,
      tvivhab: 1,
      vph_aguadv: 0,
      vph_drenaj: 0,
      vph_c_elec: 0,
      vph_cel: 0,
      vph_pc: 0,
      vph_inter: 1,
    },
    ...overrides,
  };
}

describe("parseTerritorialIndicatorParams", () => {
  it("accepts only the three levels and positive integer IDs", () => {
    for (const level of ["MUNICIPIO", "DISTRITO_LOCAL", "DISTRITO_FEDERAL"]) {
      assert.deepEqual(
        parseTerritorialIndicatorParams(
          new URLSearchParams(
            `level=${level}&versionId=4025&nominalCutId=7&demographySourceId=9&rpc=ignored&token=ignored`,
          ),
        ),
        { level, versionId: 4025, nominalCutId: 7, demographySourceId: 9 },
      );
    }
  });

  it("rejects invalid levels and invalid required or optional IDs", () => {
    for (const query of [
      "level=SECCION&versionId=4025",
      "level=MUNICIPIO&versionId=0",
      "level=MUNICIPIO&versionId=1.5",
      "level=MUNICIPIO&versionId=4025&nominalCutId=-1",
      "level=MUNICIPIO&versionId=4025&demographySourceId=NaN",
    ]) {
      assert.throws(
        () => parseTerritorialIndicatorParams(new URLSearchParams(query)),
        TerritorialIndicatorsInputError,
      );
    }
  });
});

describe("getTerritorialIndicators", () => {
  it("invokes only the fixed RPC arguments and preserves zero versus null", async () => {
    const invoke: TerritorialIndicatorsRpcInvoker = async (name, args) => {
      assert.equal(name, "rpc_indicadores_territoriales");
      assert.deepEqual(args, {
        p_nivel: "MUNICIPIO",
        p_cartografia_version_id: 4025,
        p_lista_nominal_corte_id: null,
        p_demografia_fuente_id: null,
      });
      return { data: [rpcRow()], error: null };
    };
    const response = await getTerritorialIndicators(invoke, input);
    assert.deepEqual(response.nominalSource, { id: 7, cutoffDate: "2026-07-31" });
    assert.deepEqual(response.demographicSource, { id: 9, censusYear: 2020 });
    assert.equal(response.rows[0].metrics.pea, 0);
    assert.equal(response.rows[0].metrics.poblacionConDiscapacidad, null);
    assert.equal(response.rows[0].metricQuality.poblacionTotal, 1);
  });

  it("rejects non-arrays, invalid identities, duplicates and invalid numbers", async () => {
    for (const data of [
      {},
      [rpcRow({ territorio_id: 0 })],
      [rpcRow(), rpcRow()],
      [rpcRow({ pobtot: -1 })],
      [rpcRow({ pea: Number.NaN })],
    ]) {
      await assert.rejects(
        getTerritorialIndicators(
          async () => ({ data, error: null }),
          input,
        ),
        TerritorialIndicatorsGatewayError,
      );
    }
  });

  it("rejects mixed provenance within one response", async () => {
    await assert.rejects(
      getTerritorialIndicators(
        async () => ({
          data: [
            rpcRow(),
            rpcRow({
              territorio_id: 2,
              cartografia_territorio_id: 11,
              clave: "002",
              lista_nominal_corte_id: 8,
            }),
          ],
          error: null,
        }),
        input,
      ),
      TerritorialIndicatorsGatewayError,
    );
  });
});
