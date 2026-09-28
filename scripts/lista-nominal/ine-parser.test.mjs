import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { utils, write } from "@e965/xlsx";

import {
  normalizeListaNominalRows,
  readListaNominalWorkbook,
} from "./ine-parser.mjs";

const temporaryDirectories = [];

after(async () => {
  for (const directory of temporaryDirectories) {
    assert.ok(directory.startsWith(os.tmpdir()));
    await rm(directory, { recursive: true, force: true });
  }
});

function fixtureMatrix() {
  return [
    ["Instituto Nacional Electoral"],
    ["Registro Federal de Electores"],
    ["Junta Local Ejecutiva en el Estado de México"],
    [],
    ["Padrón Electoral y Lista Nominal de Electores"],
    ["Fecha de corte 31 de julio de 2026"],
    [],
    ["(POR SECCION Y SEXO)"],
    [],
    [],
    ["DISTRITO FEDERAL", null, "DISTRITO LOCAL", null, "MUNICIPIO LOCAL", null, "SECCION", "PADRON ELECTORAL", null, null, null, "LISTA NOMINAL DE ELECTORES", null, null, null, "DIFERENCIA", "COBERTURA"],
    ["CLAVE", "NOMBRE", "CLAVE", "NOMBRE", "CLAVE", "NOMBRE", null, "HOMBRES", "MUJERES", "NO BINARIO", "TOTAL", "HOMBRES", "MUJERES", "NO BINARIO", "TOTAL", null, null],
    [],
    [0, "Residentes en el Extranjero", 0, "Residentes en el Extranjero", 0, "Residentes en el Extranjero", 0, 10, 20, 0, 30, 5, 15, 0, 20, 10, 66.6666666667],
    [1, "Jilotepec de Molina Enríquez", 14, "Jilotepec de Molina Enríquez", 1, "Acambay de Ruiz Castañeda", 1, 8, 10, 0, 18, 8, 9, 0, 17, 1, 94.4444444444],
    [1, null, 14, null, 1, null, 2, 10, 12, 1, 23, 9, 12, 1, 22, 1, 95.652173913],
  ];
}

describe("normalizeListaNominalRows", () => {
  it("parses the INE two-row header and separates foreign residents", () => {
    const result = normalizeListaNominalRows(fixtureMatrix());

    assert.equal(result.cutoffDate, "2026-07-31");
    assert.equal(result.foreignResidents.seccion, "0000");
    assert.equal(result.foreignResidents.listaTotal, 20);
    assert.equal(result.sections.length, 2);
    assert.deepEqual(
      {
        municipio: result.sections[0].municipioClave,
        seccion: result.sections[0].seccion,
        padron: result.sections[0].padronTotal,
        nominal: result.sections[0].listaTotal,
      },
      { municipio: "001", seccion: "0001", padron: 18, nominal: 17 },
    );
  });

  it("inherits merged names but requires every business key", () => {
    const result = normalizeListaNominalRows(fixtureMatrix());
    const second = result.sections[1];

    assert.equal(second.distritoFederalNombre, "Jilotepec de Molina Enríquez");
    assert.equal(second.distritoLocalNombre, "Jilotepec de Molina Enríquez");
    assert.equal(second.municipioNombre, "Acambay de Ruiz Castañeda");
    assert.equal(second.distritoFederal, "01");
    assert.equal(second.distritoLocal, "14");
    assert.equal(second.municipioClave, "001");
    assert.equal(second.seccion, "0002");

    const broken = fixtureMatrix();
    broken[15][4] = null;
    assert.throws(
      () => normalizeListaNominalRows(broken),
      /fila 16.*MUNICIPIO LOCAL CLAVE/i,
    );
  });
});

describe("readListaNominalWorkbook", () => {
  it("reads a real xlsx fixture and returns a stable source hash", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "lista-nominal-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "fixture.xlsx");
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, utils.aoa_to_sheet(fixtureMatrix()), "S");
    await writeFile(filePath, write(workbook, { type: "buffer", bookType: "xlsx" }));

    const result = await readListaNominalWorkbook(filePath);

    assert.equal(result.sheetName, "S");
    assert.equal(result.cutoffDate, "2026-07-31");
    assert.equal(result.sections.length, 2);
    assert.match(result.sourceHash, /^[0-9a-f]{64}$/);
  });

  it("rejects a workbook whose INE title is not exact", () => {
    const broken = fixtureMatrix();
    broken[4][0] = "Otro reporte";
    assert.throws(
      () => normalizeListaNominalRows(broken),
      /título esperado.*Padrón Electoral y Lista Nominal/i,
    );
  });
});
