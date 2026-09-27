import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import * as XLSX from "@e965/xlsx";

import {
  ECEG_THEMATIC_SHEETS,
  hashEcegRecord,
  parseEcegValue,
  readEcegWorkbook,
} from "./eceg-parser.mjs";

const DESCRIPTORS = [
  "Entidad federativa",
  "Distrito",
  "Grupo de complejidad 1",
  "Municipio o demarcación territorial (catálogo INE)",
  "Sección",
];

const FIXTURE_SCHEMA = Object.fromEntries(
  ECEG_THEMATIC_SHEETS.map((sheet) => [sheet, {
    indicatorCount: sheet === "Población" ? 2 : 1,
  }])
);

function dataRows(sheet) {
  const indicators = sheet === "Población"
    ? ["Población total", "Indicador repetido"]
    : [sheet === "Vivienda" ? "Indicador repetido" : `Indicador ${sheet}`];
  const header = [...DESCRIPTORS, ...indicators];
  const firstValues = sheet === "Población" ? [10, 2] : [10];
  const secondValues = sheet === "Población" ? ["*", 0] : ["*"];
  return [
    [],
    [],
    header,
    [],
    ["15  México", "001", "Disperso 1", "001 Acambay", "0001", ...firstValues],
    ["15  México", "001", "Disperso 1", "001 Acambay", "0002", ...secondValues],
  ].map((row) => row.map((value) => value ?? null));
}

async function writeWorkbook({
  omitSheet = null,
  transformSheet = null,
} = {}) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["ECEG"]]), "Índice");
  for (const sheet of ECEG_THEMATIC_SHEETS) {
    if (sheet === omitSheet) continue;
    const rows = transformSheet?.(sheet, dataRows(sheet)) ?? dataRows(sheet);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheet);
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), "sipeem-eceg-"));
  const workbookPath = path.join(directory, "eceg.xlsx");
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
  await writeFile(workbookPath, bytes);
  return workbookPath;
}

test("readEcegWorkbook normalizes all themes into one row per section", async () => {
  const result = await readEcegWorkbook(await writeWorkbook(), {
    expectedSchema: FIXTURE_SCHEMA,
  });

  assert.deepEqual(result.sheets, ECEG_THEMATIC_SHEETS);
  assert.equal(result.indicators.length, 12);
  assert.equal(result.sections.length, 2);
  assert.deepEqual(result.sections[0].geography, {
    entityCode: "15",
    entityName: "México",
    district: "001",
    complexityGroup: "Disperso 1",
    municipalityCode: "001",
    municipalityName: "Acambay",
    sectionNumber: "0001",
  });
  assert.equal(result.sections[0].indicators.poblacion_poblacion_total.value, 10);
  assert.equal(result.sections[1].indicators.poblacion_poblacion_total.value, null);
  assert.equal(result.sections[1].indicators.poblacion_poblacion_total.status, "RESERVADO");
});

test("readEcegWorkbook rejects a missing thematic sheet", async () => {
  const workbookPath = await writeWorkbook({ omitSheet: "Migración" });
  await assert.rejects(
    () => readEcegWorkbook(workbookPath, {
      expectedSchema: FIXTURE_SCHEMA,
    }),
    /missing required ECEG sheet: Migración/i
  );
});

test("readEcegWorkbook rejects a displaced descriptor header", async () => {
  const workbookPath = await writeWorkbook({
    transformSheet(sheet, rows) {
      if (sheet !== "Educación") return rows;
      return [[], ...rows];
    },
  });
  await assert.rejects(
    () => readEcegWorkbook(workbookPath, { expectedSchema: FIXTURE_SCHEMA }),
    /Educación.*header row 3/i
  );
});

test("readEcegWorkbook ignores only trailing formatted empty columns", async () => {
  const workbookPath = await writeWorkbook({
    transformSheet(sheet, rows) {
      if (sheet !== "Población") return rows;
      const changed = rows.map((row) => [...row]);
      changed[4][20] = "";
      return changed;
    },
  });
  const result = await readEcegWorkbook(workbookPath, {
    expectedSchema: FIXTURE_SCHEMA,
  });

  assert.equal(result.sheetSchemas.Población.indicatorCount, 2);
});

test("readEcegWorkbook rejects duplicate section keys within a theme", async () => {
  const workbookPath = await writeWorkbook({
    transformSheet(sheet, rows) {
      if (sheet !== "Etnicidad") return rows;
      return [...rows, [...rows[4]]];
    },
  });
  await assert.rejects(
    () => readEcegWorkbook(workbookPath, { expectedSchema: FIXTURE_SCHEMA }),
    /duplicate ECEG section key.*15-0001.*Etnicidad/i
  );
});

test("readEcegWorkbook rejects geography drift between themes", async () => {
  const workbookPath = await writeWorkbook({
    transformSheet(sheet, rows) {
      if (sheet !== "Discapacidad") return rows;
      const changed = rows.map((row) => [...row]);
      changed[4][3] = "002 Aculco";
      return changed;
    },
  });
  await assert.rejects(
    () => readEcegWorkbook(workbookPath, { expectedSchema: FIXTURE_SCHEMA }),
    /geography mismatch.*15-0001.*Discapacidad/i
  );
});

test("readEcegWorkbook gives duplicate official headers distinct stable ids", async () => {
  const workbookPath = await writeWorkbook({
    transformSheet(sheet, rows) {
      if (sheet !== "Población") return rows;
      const changed = rows.map((row) => [...row]);
      changed[2][5] = "Indicador repetido";
      return changed;
    },
  });
  const result = await readEcegWorkbook(workbookPath, {
    expectedSchema: FIXTURE_SCHEMA,
  });
  const ids = result.indicators
    .filter((indicator) => indicator.theme === "Población")
    .map((indicator) => indicator.id);

  assert.deepEqual(ids, [
    "poblacion_indicador_repetido",
    "poblacion_indicador_repetido__2",
  ]);
});

test("parseEcegValue preserves reserved, absent, zero and decimal values", () => {
  assert.deepEqual(parseEcegValue("*"), { value: null, status: "RESERVADO" });
  assert.deepEqual(parseEcegValue(""), { value: null, status: "AUSENTE" });
  assert.deepEqual(parseEcegValue(null), { value: null, status: "AUSENTE" });
  assert.deepEqual(parseEcegValue(0), { value: 0, status: "PRESENTE" });
  assert.deepEqual(parseEcegValue("2.09"), { value: 2.09, status: "PRESENTE" });
  assert.throws(() => parseEcegValue("número roto"), /invalid ECEG numeric value/i);
});

test("hashEcegRecord is stable across object key order", () => {
  assert.equal(
    hashEcegRecord({ section: "0001", district: "001" }),
    hashEcegRecord({ district: "001", section: "0001" })
  );
  assert.notEqual(
    hashEcegRecord({ section: "0001" }),
    hashEcegRecord({ section: "0002" })
  );
});
