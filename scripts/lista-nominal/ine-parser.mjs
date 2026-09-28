import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { read as readXlsx, utils } from "@e965/xlsx";

const EXPECTED_TITLE = "Padrón Electoral y Lista Nominal de Electores";
const MONTHS = new Map([
  ["enero", "01"],
  ["febrero", "02"],
  ["marzo", "03"],
  ["abril", "04"],
  ["mayo", "05"],
  ["junio", "06"],
  ["julio", "07"],
  ["agosto", "08"],
  ["septiembre", "09"],
  ["octubre", "10"],
  ["noviembre", "11"],
  ["diciembre", "12"],
]);

function cellText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseCutoffDate(value) {
  const text = cellText(value).toLocaleLowerCase("es-MX");
  const match = text.match(
    /^fecha de corte\s+(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})$/iu,
  );
  const month = match ? MONTHS.get(match[2]) : null;
  if (!match || !month) {
    throw new Error(`Fecha de corte INE inválida: ${cellText(value) || "vacía"}`);
  }
  const day = Number(match[1]);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error(`Fecha de corte INE inválida: ${cellText(value)}`);
  }
  return `${match[3]}-${month}-${String(day).padStart(2, "0")}`;
}

function requireKey(value, width, label, sourceRow, { allowZero = false } = {}) {
  const text = cellText(value);
  if (!/^\d+$/.test(text)) {
    throw new Error(`Fila ${sourceRow}: ${label} debe ser una clave entera`);
  }
  const numeric = Number(text);
  if (!Number.isSafeInteger(numeric) || (!allowZero && numeric <= 0)) {
    throw new Error(`Fila ${sourceRow}: ${label} fuera de rango`);
  }
  return String(numeric).padStart(width, "0");
}

function requireInteger(value, label, sourceRow) {
  const normalized =
    typeof value === "string" ? value.replace(/,/g, "").trim() : value;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
    throw new Error(`Fila ${sourceRow}: ${label} debe ser un entero`);
  }
  return numeric;
}

function requireNumber(value, label, sourceRow) {
  const normalized =
    typeof value === "string"
      ? value.replace(/,/g, "").replace(/%$/, "").trim()
      : value;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Fila ${sourceRow}: ${label} debe ser numérica`);
  }
  return numeric;
}

function assertHeader(matrix) {
  if (cellText(matrix?.[4]?.[0]) !== EXPECTED_TITLE) {
    throw new Error(`No se encontró el título esperado: ${EXPECTED_TITLE}`);
  }

  const first = matrix?.[10] ?? [];
  const second = matrix?.[11] ?? [];
  const expected = [
    [first[0], "DISTRITO FEDERAL"],
    [first[2], "DISTRITO LOCAL"],
    [first[4], "MUNICIPIO LOCAL"],
    [first[6], "SECCION"],
    [first[7], "PADRON ELECTORAL"],
    [first[11], "LISTA NOMINAL DE ELECTORES"],
    [second[0], "CLAVE"],
    [second[10], "TOTAL"],
    [second[14], "TOTAL"],
  ];
  const mismatch = expected.find(([actual, wanted]) => cellText(actual) !== wanted);
  if (mismatch) {
    throw new Error(
      `Encabezado INE inesperado: se esperaba ${mismatch[1]} y se recibió ${cellText(mismatch[0]) || "vacío"}`,
    );
  }
}

function isEmptyRow(row) {
  return !row?.some((value) => cellText(value) !== "");
}

function normalizeDataRow(row, sourceRow, previousNames) {
  const isForeign = Number(row[6]) === 0;
  const keyOptions = { allowZero: isForeign };
  const names = {
    distritoFederalNombre:
      cellText(row[1]) || previousNames.distritoFederalNombre,
    distritoLocalNombre: cellText(row[3]) || previousNames.distritoLocalNombre,
    municipioNombre: cellText(row[5]) || previousNames.municipioNombre,
  };

  for (const [label, value] of Object.entries(names)) {
    if (!value) {
      throw new Error(`Fila ${sourceRow}: ${label} no puede quedar vacío`);
    }
  }

  return {
    distritoFederal: requireKey(
      row[0],
      2,
      "DISTRITO FEDERAL CLAVE",
      sourceRow,
      keyOptions,
    ),
    distritoFederalNombre: names.distritoFederalNombre,
    distritoLocal: requireKey(
      row[2],
      2,
      "DISTRITO LOCAL CLAVE",
      sourceRow,
      keyOptions,
    ),
    distritoLocalNombre: names.distritoLocalNombre,
    municipioClave: requireKey(
      row[4],
      3,
      "MUNICIPIO LOCAL CLAVE",
      sourceRow,
      keyOptions,
    ),
    municipioNombre: names.municipioNombre,
    seccion: requireKey(row[6], 4, "SECCION", sourceRow, keyOptions),
    padronHombres: requireInteger(row[7], "PADRON HOMBRES", sourceRow),
    padronMujeres: requireInteger(row[8], "PADRON MUJERES", sourceRow),
    padronNoBinario: requireInteger(row[9], "PADRON NO BINARIO", sourceRow),
    padronTotal: requireInteger(row[10], "PADRON TOTAL", sourceRow),
    listaHombres: requireInteger(row[11], "LISTA HOMBRES", sourceRow),
    listaMujeres: requireInteger(row[12], "LISTA MUJERES", sourceRow),
    listaNoBinario: requireInteger(row[13], "LISTA NO BINARIO", sourceRow),
    listaTotal: requireInteger(row[14], "LISTA TOTAL", sourceRow),
    diferencia: requireInteger(row[15], "DIFERENCIA", sourceRow),
    cobertura: requireNumber(row[16], "COBERTURA", sourceRow),
    sourceRow,
  };
}

export function normalizeListaNominalRows(matrix) {
  assertHeader(matrix);
  const cutoffDate = parseCutoffDate(matrix?.[5]?.[0]);
  const sections = [];
  let foreignResidents = null;
  let previousNames = {
    distritoFederalNombre: "",
    distritoLocalNombre: "",
    municipioNombre: "",
  };

  for (let index = 13; index < matrix.length; index += 1) {
    const row = matrix[index];
    if (isEmptyRow(row)) continue;
    const normalized = normalizeDataRow(row, index + 1, previousNames);
    previousNames = {
      distritoFederalNombre: normalized.distritoFederalNombre,
      distritoLocalNombre: normalized.distritoLocalNombre,
      municipioNombre: normalized.municipioNombre,
    };

    if (normalized.seccion === "0000") {
      if (foreignResidents) {
        throw new Error(`Fila ${normalized.sourceRow}: sección 0000 duplicada`);
      }
      foreignResidents = normalized;
    } else {
      sections.push(normalized);
    }
  }

  if (!foreignResidents) {
    throw new Error("No se encontró la fila 0000 de residentes en el extranjero");
  }

  return { cutoffDate, sections, foreignResidents };
}

export async function readListaNominalWorkbook(filePath) {
  const bytes = await readFile(filePath);
  const sourceHash = createHash("sha256").update(bytes).digest("hex");
  const workbook = readXlsx(bytes, { type: "buffer", raw: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("El libro no contiene hojas");
  const matrix = utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: null,
    raw: true,
  });
  return { sheetName, sourceHash, ...normalizeListaNominalRows(matrix) };
}
