import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readListaNominalWorkbook } from "./ine-parser.mjs";
import {
  assertExpectedListaNominalProfile,
  buildListaNominalProfile,
} from "./profile.mjs";

const SOURCE_FILE = "C:/Users/NZXT/Downloads/S.xlsx";
const SOURCE_HASH =
  "d016713ed9304ae696fbcf875141cf8268799d05468f1afb79bb8785227de161";

function row(overrides = {}) {
  return {
    distritoFederal: "01",
    distritoFederalNombre: "Distrito federal uno",
    distritoLocal: "14",
    distritoLocalNombre: "Distrito local catorce",
    municipioClave: "001",
    municipioNombre: "Municipio uno",
    seccion: "0001",
    padronHombres: 8,
    padronMujeres: 10,
    padronNoBinario: 0,
    padronTotal: 18,
    listaHombres: 8,
    listaMujeres: 9,
    listaNoBinario: 0,
    listaTotal: 17,
    diferencia: 1,
    cobertura: (17 / 18) * 100,
    sourceRow: 15,
    ...overrides,
  };
}

function archive(overrides = {}) {
  return {
    sheetName: "S",
    sourceHash: "a".repeat(64),
    cutoffDate: "2026-07-31",
    foreignResidents: row({
      distritoFederal: "00",
      distritoFederalNombre: "Residentes en el Extranjero",
      distritoLocal: "00",
      distritoLocalNombre: "Residentes en el Extranjero",
      municipioClave: "000",
      municipioNombre: "Residentes en el Extranjero",
      seccion: "0000",
      sourceRow: 14,
    }),
    sections: [
      row(),
      row({
        municipioClave: "002",
        municipioNombre: "Municipio dos",
        seccion: "0002",
        distritoFederal: "02",
        distritoLocal: "15",
        sourceRow: 16,
      }),
    ],
    ...overrides,
  };
}

describe("buildListaNominalProfile", () => {
  it("summarizes valid sections without mixing foreign residents", () => {
    const profile = buildListaNominalProfile(archive());

    assert.deepEqual(
      {
        sections: profile.sections,
        municipalities: profile.municipalities,
        federalDistricts: profile.federalDistricts,
        localDistricts: profile.localDistricts,
        padron: profile.padron,
        nominal: profile.nominal,
        difference: profile.difference,
      },
      {
        sections: 2,
        municipalities: 2,
        federalDistricts: 2,
        localDistricts: 2,
        padron: 36,
        nominal: 34,
        difference: 2,
      },
    );
    assert.equal(profile.foreignResidents.padron, 18);
    assert.equal(profile.coverage, (34 / 36) * 100);
  });

  it("rejects duplicate municipality-section business keys", () => {
    const duplicate = row({ sourceRow: 17 });
    assert.throws(
      () => buildListaNominalProfile(archive({ sections: [row(), duplicate] })),
      /duplicada.*001.*0001.*filas 15 y 17/i,
    );
  });

  it("rejects negative counts and inconsistent arithmetic", () => {
    assert.throws(
      () =>
        buildListaNominalProfile(
          archive({ sections: [row({ listaHombres: -1 })] }),
        ),
      /fila 15.*no negativo/i,
    );
    assert.throws(
      () =>
        buildListaNominalProfile(
          archive({ sections: [row({ padronTotal: 19 })] }),
        ),
      /fila 15.*padrón.*sexos/i,
    );
    assert.throws(
      () =>
        buildListaNominalProfile(
          archive({ sections: [row({ diferencia: 2 })] }),
        ),
      /fila 15.*diferencia/i,
    );
    assert.throws(
      () =>
        buildListaNominalProfile(
          archive({ sections: [row({ cobertura: 90 })] }),
        ),
      /fila 15.*cobertura/i,
    );
  });

  it("requires exactly one foreign-resident row with section 0000", () => {
    assert.throws(
      () => buildListaNominalProfile(archive({ foreignResidents: null })),
      /residentes en el extranjero/i,
    );
    assert.throws(
      () =>
        buildListaNominalProfile(
          archive({ foreignResidents: row({ seccion: "0009" }) }),
        ),
      /sección 0000/i,
    );
  });
});

describe("production INE nominal-list profile", () => {
  it("matches the approved source hash, cutoff and totals", async () => {
    const source = await readListaNominalWorkbook(SOURCE_FILE);
    const profile = assertExpectedListaNominalProfile(
      buildListaNominalProfile(source),
    );

    assert.equal(profile.sourceHash, SOURCE_HASH);
    assert.equal(profile.cutoffDate, "2026-07-31");
    assert.equal(profile.sections, 7191);
    assert.equal(profile.municipalities, 125);
    assert.equal(profile.federalDistricts, 40);
    assert.equal(profile.localDistricts, 45);
    assert.equal(profile.padron, 13_407_250);
    assert.equal(profile.nominal, 13_206_301);
    assert.equal(profile.difference, 200_949);
    assert.ok(Math.abs(profile.coverage - 98.501192) < 0.000001);
  });
});
