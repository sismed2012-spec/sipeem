import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { parse } from "csv-parse/sync";
import { unzipSync } from "fflate";

const EXPECTED_COLUMN_COUNT = 286;

const TEXT_MNEMONICS = new Set([
  "ENTIDAD",
  "NOM_ENT",
  "MUN",
  "NOM_MUN",
  "LOC",
  "NOM_LOC",
  "LONGITUD",
  "LATITUD",
  "ALTITUD",
]);

const DECIMAL_MNEMONICS = new Set([
  "REL_H_M",
  "PROM_HNV",
  "GRAPROES",
  "PROM_OCUP",
  "PRO_OCUP_C",
]);

const SUMMARY_MNEMONICS = new Set([
  "POBTOT", "POBFEM", "POBMAS", "POB0_14", "POB15_64", "POB65_MAS",
  "P_18YMAS", "PEA", "POCUPADA", "P15YM_AN", "GRAPROES", "PDER_SS",
  "PCON_DISC", "P3YM_HLI", "POB_AFRO", "TVIVHAB", "VPH_AGUADV",
  "VPH_DRENAJ", "VPH_C_ELEC", "VPH_CEL", "VPH_PC", "VPH_INTER",
]);

const REQUIRED_MEMBERS = {
  catalog: /\/catalogos\/tam_loc\.csv\.csv$/i,
  dataset: /\/conjunto_de_datos\/conjunto_de_datos_iter_15CSV20\.csv$/i,
  dictionary: /\/diccionario_datos\/diccionario_datos_iter_15CSV20\.csv$/i,
  metadata: /\/metadatos\/metadatos_iter_15_cpv2020\.txt$/i,
};

function stripUtf8Bom(bytes) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return bytes.subarray(3);
  }
  return bytes;
}

function decodeMember(bytes) {
  const payload = stripUtf8Bom(bytes);
  try {
    return {
      encoding: "utf-8",
      text: new TextDecoder("utf-8", { fatal: true }).decode(payload),
    };
  } catch {
    const text = new TextDecoder("windows-1252", { fatal: true }).decode(payload);
    if (text.includes("\uFFFD")) {
      throw new Error("ITER member contains undecodable replacement characters");
    }
    return { encoding: "windows-1252", text };
  }
}

function findRequiredMembers(entries) {
  return Object.fromEntries(
    Object.entries(REQUIRED_MEMBERS).map(([kind, pattern]) => {
      const matches = entries.filter(([name, bytes]) => bytes.length > 0 && pattern.test(name));
      if (matches.length === 0) {
        throw new Error(`Missing required ITER member: ${kind}`);
      }
      if (matches.length > 1) {
        throw new Error(`Multiple ITER members match required resource: ${kind}`);
      }
      return [kind, matches[0]];
    })
  );
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

export function classifyIterRow(row) {
  const municipality = String(row.MUN ?? "").padStart(3, "0");
  const locality = String(row.LOC ?? "").padStart(4, "0");
  if (municipality === "000" && locality === "0000") return "STATE_TOTAL";
  if (locality === "9998") return "SPECIAL_9998";
  if (locality === "9999") return "SPECIAL_9999";
  if (municipality !== "000" && locality === "0000") return "MUNICIPAL_TOTAL";
  if (municipality !== "000" && /^\d{4}$/.test(locality)) return "LOCALITY";
  return "UNKNOWN";
}

export function parseIterValue(raw) {
  const normalized = String(raw ?? "").trim();
  if (normalized === "*") return { value: null, status: "RESERVADO" };
  if (normalized === "") return { value: null, status: "AUSENTE" };
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ITER numeric value: ${normalized}`);
  }
  return { value, status: "PRESENTE" };
}

export function hashRecord(record) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(record)))
    .digest("hex");
}

export function parseDmsCoordinate(raw) {
  const normalized = String(raw ?? "").trim();
  if (!normalized) return null;
  const match = normalized.match(
    /^(\d{1,3})°\s*(\d{1,2})'\s*(\d+(?:\.\d+)?)"\s*([NSEWO])$/i
  );
  if (!match) throw new Error(`Invalid DMS coordinate: ${normalized}`);
  const [, degrees, minutes, seconds, direction] = match;
  const magnitude = Number(degrees) + Number(minutes) / 60 + Number(seconds) / 3600;
  return /[SWO]/i.test(direction) ? -magnitude : magnitude;
}

export function parseIterDictionary(dictionaryText, datasetHeaders) {
  const rows = parse(dictionaryText, {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: false,
  });
  const headerIndex = rows.findIndex(
    (row) => String(row[0] ?? "").trim() === "Núm."
      && String(row[3] ?? "").trim() === "Mnemónico"
  );
  if (headerIndex < 0) throw new Error("ITER dictionary header was not found");

  const dictionaryRows = rows
    .slice(headerIndex + 1)
    .filter((row) => String(row[3] ?? "").trim())
    .map((row) => ({
      name: String(row[1] ?? "").trim(),
      description: String(row[2] ?? "").trim() || null,
      mnemonic: String(row[3] ?? "").trim(),
      range: String(row[4] ?? "").trim() || null,
      length: String(row[5] ?? "").trim() || null,
    }));
  const byMnemonic = new Map(dictionaryRows.map((row) => [row.mnemonic, row]));

  return datasetHeaders.map((mnemonic, order) => {
    const row = byMnemonic.get(mnemonic);
    if (!row) throw new Error(`ITER dictionary is missing mnemonic: ${mnemonic}`);
    const logicalType = TEXT_MNEMONICS.has(mnemonic)
      ? "TEXTO"
      : DECIMAL_MNEMONICS.has(mnemonic)
        ? "DECIMAL"
        : "ENTERO";
    return {
      ...row,
      logicalType,
      unit: logicalType === "TEXTO" ? "TEXTO" : logicalType === "DECIMAL" ? "PROMEDIO" : "CONTEO",
      category: null,
      reserveRule: logicalType === "TEXTO" ? {} : { marker: "*" },
      exposeSummary: SUMMARY_MNEMONICS.has(mnemonic),
      order,
    };
  });
}

export async function readIterArchive(zipPath) {
  const archiveBytes = await readFile(zipPath);
  const unzipped = unzipSync(archiveBytes);
  const required = findRequiredMembers(Object.entries(unzipped));
  const decoded = Object.fromEntries(
    Object.entries(required).map(([kind, [, bytes]]) => [kind, decodeMember(bytes)])
  );

  const records = parse(decoded.dataset.text, {
    bom: false,
    relax_column_count: true,
    skip_empty_lines: true,
  });
  const headers = records[0] ?? [];
  if (headers.length !== EXPECTED_COLUMN_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_COLUMN_COUNT} columns, received ${headers.length}`
    );
  }

  const rows = records.slice(1).map((values, index) => {
    if (values.length !== headers.length) {
      throw new Error(
        `ITER row ${index + 2} has ${values.length} columns; expected ${headers.length}`
      );
    }
    return Object.fromEntries(headers.map((header, column) => [header, values[column]]));
  });

  const seenLocalities = new Set();
  for (const row of rows) {
    if (classifyIterRow(row) !== "LOCALITY") continue;
    const key = `${row.ENTIDAD}-${row.MUN}-${row.LOC}`;
    if (seenLocalities.has(key)) {
      throw new Error(`Duplicate ITER locality key: ${key}`);
    }
    seenLocalities.add(key);
  }

  return {
    sourceHash: createHash("sha256").update(archiveBytes).digest("hex"),
    members: Object.fromEntries(
      Object.entries(required).map(([kind, [name, bytes]]) => [
        kind,
        { name, size: bytes.length },
      ])
    ),
    encodings: Object.fromEntries(
      Object.entries(decoded).map(([kind, value]) => [kind, value.encoding])
    ),
    headers,
    rows,
    catalogText: decoded.catalog.text,
    dictionaryText: decoded.dictionary.text,
    metadataText: decoded.metadata.text,
  };
}
