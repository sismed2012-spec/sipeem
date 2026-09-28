import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import * as XLSX from "@e965/xlsx";

export const ECEG_THEMATIC_SHEETS = [
  "Población",
  "Fecundidad",
  "Migración",
  "Etnicidad",
  "Discapacidad",
  "Educación",
  "Características económicas",
  "Servicios de salud",
  "Situación conyugal",
  "Hogares censales",
  "Vivienda",
];

const DESCRIPTOR_HEADERS = [
  "Entidad federativa",
  "Distrito",
  "Grupo de complejidad 1",
  "Municipio o demarcación territorial (catálogo INE)",
  "Sección",
];

export const OFFICIAL_ECEG_SCHEMA = {
  "Población": { indicatorCount: 49, headerHash: "799d518d2ca73e6e711c5b384e327daa828ae47810cd7bc3f5c198550cf3f7bb" },
  "Fecundidad": { indicatorCount: 1, headerHash: "71b89c5693fc5bca57b69cfc85ac88d0b287aed4e7d6990b1d73a77192d66196" },
  "Migración": { indicatorCount: 12, headerHash: "3a602b8bb22733febd3f163b0e56e2aaba6e294d056f1a8c541620d2e8a15a71" },
  "Etnicidad": { indicatorCount: 16, headerHash: "771202c92904b5e6cc0e23afa120c325a7fe3a8bc96935eb6ef62a3bf2b4e178" },
  "Discapacidad": { indicatorCount: 16, headerHash: "9de121958c7af674cd1f08dc85bc560eb607e8fbf4fb005f343e6ad35c530ebe" },
  "Educación": { indicatorCount: 42, headerHash: "865d3017a70c42e82fe7b104eae470006c7f8d09a79cff5df49fb7236c1e4d87" },
  "Características económicas": { indicatorCount: 12, headerHash: "8e7be1b08f7ed7986f58578ca29a6d83d98cf8ef937bb2dbeb47b68a517f88e9" },
  "Servicios de salud": { indicatorCount: 10, headerHash: "8e83e45875b9e6db6ea502430c85dd70db92a1a860abd07720bb634fbf57c8d6" },
  "Situación conyugal": { indicatorCount: 3, headerHash: "b2a0b62e5c2a5d6cf41166051821e44a555eab918a65ca0bde7fc56b37048670" },
  "Hogares censales": { indicatorCount: 6, headerHash: "ef1ef71f1f6bab7b91bb64ba8b6a39c33ef1c5cb21307ed02b6a0eeba58180f7" },
  "Vivienda": { indicatorCount: 53, headerHash: "d807fcfecfa3626d4fc152f2c83af37cb94553bfced4b9e3a33567788e90cea0" },
};

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function normalizedText(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function slug(value) {
  return normalizedText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
}

function headerHash(headers) {
  return createHash("sha256").update(JSON.stringify(headers)).digest("hex");
}

function parseLabeledCode(raw, width, context) {
  const text = normalizedText(raw);
  const match = text.match(new RegExp(`^(\\d{1,${width}})(?:\\s+(.*))?$`, "u"));
  if (!match) throw new Error(`Invalid ECEG ${context}: ${text || "<empty>"}`);
  return {
    code: match[1].padStart(width, "0"),
    name: normalizedText(match[2]) || null,
  };
}

function parseGeography(row, sheet, rowNumber) {
  const entity = parseLabeledCode(row[0], 2, `${sheet} entity at row ${rowNumber}`);
  const municipality = parseLabeledCode(
    row[3],
    3,
    `${sheet} municipality at row ${rowNumber}`
  );
  const sectionText = normalizedText(row[4]);
  if (!/^\d{1,4}$/u.test(sectionText)) {
    throw new Error(`Invalid ECEG ${sheet} section at row ${rowNumber}: ${sectionText}`);
  }
  return {
    entityCode: entity.code,
    entityName: entity.name,
    district: normalizedText(row[1]),
    complexityGroup: normalizedText(row[2]) || null,
    municipalityCode: municipality.code,
    municipalityName: municipality.name,
    sectionNumber: sectionText.padStart(4, "0"),
  };
}

function sameGeography(left, right) {
  return Object.keys(left).every((key) => left[key] === right[key]);
}

function buildIndicators(sheet, headers) {
  const themeSlug = slug(sheet);
  const used = new Map();
  return headers.slice(DESCRIPTOR_HEADERS.length).map((officialHeader, offset) => {
    const base = `${themeSlug}_${slug(officialHeader)}`;
    const occurrence = (used.get(base) ?? 0) + 1;
    used.set(base, occurrence);
    return {
      id: occurrence === 1 ? base : `${base}__${occurrence}`,
      theme: sheet,
      officialHeader,
      columnNumber: offset + DESCRIPTOR_HEADERS.length + 1,
      order: offset,
    };
  });
}

function assertSheetSchema(sheet, rows, expected) {
  const headers = (rows[2] ?? []).map(normalizedText);
  while (headers.at(-1) === "") headers.pop();
  const descriptors = headers.slice(0, DESCRIPTOR_HEADERS.length);
  if (
    descriptors.length !== DESCRIPTOR_HEADERS.length
    || descriptors.some((value, index) => value !== DESCRIPTOR_HEADERS[index])
  ) {
    throw new Error(`${sheet}: expected ECEG descriptor header row 3`);
  }
  const indicatorCount = headers.length - DESCRIPTOR_HEADERS.length;
  if (indicatorCount !== expected.indicatorCount) {
    throw new Error(
      `${sheet}: expected ${expected.indicatorCount} indicators, received ${indicatorCount}`
    );
  }
  const hash = headerHash(headers);
  if (expected.headerHash && hash !== expected.headerHash) {
    throw new Error(`${sheet}: official header hash mismatch (${hash})`);
  }
  return { headers, hash };
}

export function parseEcegValue(raw) {
  if (raw === null || raw === undefined || normalizedText(raw) === "") {
    return { value: null, status: "AUSENTE" };
  }
  if (normalizedText(raw) === "*") {
    return { value: null, status: "RESERVADO" };
  }
  const value = typeof raw === "number" ? raw : Number(normalizedText(raw));
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ECEG numeric value: ${normalizedText(raw)}`);
  }
  return { value, status: "PRESENTE" };
}

export function hashEcegRecord(record) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(record)))
    .digest("hex");
}

export async function readEcegWorkbook(
  workbookPath,
  { entityCode = "15", expectedSchema = OFFICIAL_ECEG_SCHEMA } = {}
) {
  const bytes = await readFile(workbookPath);
  const workbook = XLSX.read(bytes, { type: "buffer", dense: true });
  for (const sheet of ECEG_THEMATIC_SHEETS) {
    if (!workbook.SheetNames.includes(sheet)) {
      throw new Error(`Missing required ECEG sheet: ${sheet}`);
    }
  }

  const sectionsByKey = new Map();
  const keysBySheet = new Map();
  const indicators = [];
  const sheetSchemas = {};

  for (const sheet of ECEG_THEMATIC_SHEETS) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    });
    const schema = assertSheetSchema(sheet, rows, expectedSchema[sheet]);
    sheetSchemas[sheet] = {
      indicatorCount: schema.headers.length - DESCRIPTOR_HEADERS.length,
      headerHash: schema.hash,
    };
    const sheetIndicators = buildIndicators(sheet, schema.headers);
    indicators.push(...sheetIndicators);
    const seen = new Set();

    for (let index = 3; index < rows.length; index += 1) {
      const row = rows[index] ?? [];
      const entityText = normalizedText(row[0]);
      const sectionText = normalizedText(row[4]);
      if (!entityText.startsWith(`${entityCode} `) || !/^\d{1,4}$/u.test(sectionText)) {
        continue;
      }
      const rowNumber = index + 1;
      const geography = parseGeography(row, sheet, rowNumber);
      const key = `${geography.entityCode}-${geography.sectionNumber}`;
      if (seen.has(key)) {
        throw new Error(`Duplicate ECEG section key ${key} in ${sheet}`);
      }
      seen.add(key);

      let section = sectionsByKey.get(key);
      if (!section) {
        section = { geography, rowNumbers: {}, indicators: {} };
        sectionsByKey.set(key, section);
      } else if (!sameGeography(section.geography, geography)) {
        throw new Error(`Geography mismatch for ECEG section ${key} in ${sheet}`);
      }
      section.rowNumbers[sheet] = rowNumber;
      for (const indicator of sheetIndicators) {
        section.indicators[indicator.id] = parseEcegValue(
          row[indicator.columnNumber - 1]
        );
      }
    }
    keysBySheet.set(sheet, seen);
  }

  const baseline = keysBySheet.get(ECEG_THEMATIC_SHEETS[0]);
  for (const [sheet, keys] of keysBySheet) {
    if (keys.size !== baseline.size) {
      throw new Error(
        `${sheet}: expected ${baseline.size} ECEG sections, received ${keys.size}`
      );
    }
    for (const key of baseline) {
      if (!keys.has(key)) throw new Error(`${sheet}: missing ECEG section ${key}`);
    }
  }

  const sections = [...sectionsByKey.values()]
    .map((section) => ({
      ...section,
      recordHash: hashEcegRecord({
        geography: section.geography,
        indicators: section.indicators,
      }),
    }))
    .sort((left, right) => left.geography.sectionNumber.localeCompare(
      right.geography.sectionNumber,
      "es-MX",
      { numeric: true }
    ));

  return {
    sourceHash: createHash("sha256").update(bytes).digest("hex"),
    sheets: [...ECEG_THEMATIC_SHEETS],
    sheetSchemas,
    indicators,
    sections,
  };
}
