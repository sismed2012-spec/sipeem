import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { zipSync, strToU8 } from "fflate";

import {
  classifyIterRow,
  hashRecord,
  parseDmsCoordinate,
  parseIterDictionary,
  parseIterValue,
  readIterArchive,
} from "./iter-parser.mjs";

const REQUIRED_HEADERS = [
  "ENTIDAD",
  "NOM_ENT",
  "MUN",
  "NOM_MUN",
  "LOC",
  "NOM_LOC",
  "LONGITUD",
  "LATITUD",
  "ALTITUD",
  "POBTOT",
];

function headers286() {
  return [
    ...REQUIRED_HEADERS,
    ...Array.from({ length: 276 }, (_, index) => `IND_${index + 1}`),
  ];
}

function csvRow(overrides = {}) {
  const values = Object.fromEntries(headers286().map((header) => [header, "0"]));
  Object.assign(values, {
    ENTIDAD: "15",
    NOM_ENT: "México",
    MUN: "001",
    NOM_MUN: "Acambay de Ruíz Castañeda",
    LOC: "0001",
    NOM_LOC: "San José Niños Héroes",
    LONGITUD: `99°50'38.515" W`,
    LATITUD: `19°57'22.423" N`,
    ALTITUD: "2550",
    POBTOT: "123",
    ...overrides,
  });
  return headers286()
    .map((header) => {
      const value = values[header];
      return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
    })
    .join(",");
}

function encodeWindows1252(text) {
  return Uint8Array.from([...text].map((character) => {
    const code = character.codePointAt(0);
    if (code > 255) throw new Error(`Unsupported fixture character: ${character}`);
    return code;
  }));
}

function withUtf8Bom(bytes) {
  return Uint8Array.from([0xef, 0xbb, 0xbf, ...bytes]);
}

async function writeArchive({
  datasetEncoding = "utf-8",
  includeMetadata = true,
  header = headers286(),
  dataRows = [csvRow()],
} = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sipeem-iter-"));
  const zipPath = path.join(directory, "iter.zip");
  const datasetText = `${header.join(",")}\n${dataRows.join("\n")}\n`;
  const datasetBytes = datasetEncoding === "windows-1252"
    ? withUtf8Bom(encodeWindows1252(datasetText))
    : withUtf8Bom(strToU8(datasetText));
  const entries = {
    "iter/catalogos/tam_loc.csv.csv": withUtf8Bom(strToU8("tam_loc,descripcion\n1,1 a 249 habitantes\n")),
    "iter/conjunto_de_datos/conjunto_de_datos_iter_15CSV20.csv": datasetBytes,
    "iter/diccionario_datos/diccionario_datos_iter_15CSV20.csv": withUtf8Bom(strToU8("CENSO DE POBLACIÓN Y VIVIENDA 2020\n")),
  };
  if (includeMetadata) {
    entries["iter/metadatos/metadatos_iter_15_cpv2020.txt"] = withUtf8Bom(strToU8("title: Población de México\n"));
  }
  await writeFile(zipPath, zipSync(entries));
  return zipPath;
}

test("readIterArchive decodes a BOM-prefixed UTF-8 dataset without mojibake", async () => {
  const archive = await readIterArchive(await writeArchive());

  assert.equal(archive.encodings.dataset, "utf-8");
  assert.equal(archive.rows[0].NOM_ENT, "México");
  assert.equal(archive.rows[0].NOM_LOC, "San José Niños Héroes");
  assert.equal(archive.headers.length, 286);
  assert.match(archive.dictionaryText, /POBLACIÓN/);
});

test("readIterArchive falls back to Windows-1252 when strict UTF-8 decoding fails", async () => {
  const archive = await readIterArchive(
    await writeArchive({ datasetEncoding: "windows-1252" })
  );

  assert.equal(archive.encodings.dataset, "windows-1252");
  assert.equal(archive.rows[0].NOM_ENT, "México");
  assert.equal(archive.rows[0].NOM_LOC, "San José Niños Héroes");
  assert.doesNotMatch(archive.rows[0].NOM_LOC, /�|Ã/);
});

test("readIterArchive rejects an archive missing a required resource", async () => {
  const zipPath = await writeArchive({ includeMetadata: false });
  await assert.rejects(
    () => readIterArchive(zipPath),
    /missing required ITER member: metadata/i
  );
});

test("readIterArchive rejects a dataset whose header does not have 286 columns", async () => {
  const zipPath = await writeArchive({ header: headers286().slice(0, -1) });
  await assert.rejects(
    () => readIterArchive(zipPath),
    /expected 286 columns, received 285/i
  );
});

test("readIterArchive rejects duplicate real-locality business keys", async () => {
  const duplicate = csvRow({ LOC: "0007" });
  const zipPath = await writeArchive({ dataRows: [duplicate, duplicate] });

  await assert.rejects(
    () => readIterArchive(zipPath),
    /duplicate ITER locality key: 15-001-0007/i
  );
});

test("classifyIterRow distinguishes totals, special rows, and real localities", () => {
  assert.equal(classifyIterRow({ MUN: "000", LOC: "0000" }), "STATE_TOTAL");
  assert.equal(classifyIterRow({ MUN: "001", LOC: "0000" }), "MUNICIPAL_TOTAL");
  assert.equal(classifyIterRow({ MUN: "001", LOC: "9998" }), "SPECIAL_9998");
  assert.equal(classifyIterRow({ MUN: "001", LOC: "9999" }), "SPECIAL_9999");
  assert.equal(classifyIterRow({ MUN: "001", LOC: "0001" }), "LOCALITY");
});

test("parseIterValue keeps reserved values distinct from a numeric zero", () => {
  assert.deepEqual(parseIterValue("*"), { value: null, status: "RESERVADO" });
  assert.deepEqual(parseIterValue(""), { value: null, status: "AUSENTE" });
  assert.deepEqual(parseIterValue("0"), { value: 0, status: "PRESENTE" });
  assert.deepEqual(parseIterValue("12.5"), { value: 12.5, status: "PRESENTE" });
});

test("hashRecord is stable across object key order", () => {
  assert.equal(hashRecord({ MUN: "001", LOC: "0001" }), hashRecord({ LOC: "0001", MUN: "001" }));
  assert.notEqual(hashRecord({ MUN: "001", LOC: "0001" }), hashRecord({ MUN: "001", LOC: "0002" }));
});

test("parseDmsCoordinate returns longitude before latitude with correct signs", () => {
  assert.equal(parseDmsCoordinate(`99°50'38.515" W`), -99.84403194444444);
  assert.equal(parseDmsCoordinate(`19°57'22.423" N`), 19.956228611111112);
  assert.equal(parseDmsCoordinate(""), null);
});

test("parseIterDictionary aligns trimmed mnemonics with the dataset header", () => {
  const dictionaryText = [
    ",,,,,,,,,",
    "Núm.,Indicador,Descripción,Mnemónico,Rangos,Longitud,,,,",
    "1,Clave de entidad,Identificador,ENTIDAD,00…32,2,,,,",
    "2,Entidad,Nombre oficial,NOM_ENT ,Alfanumérico,50,,,,",
    "1,Población total,Personas residentes,POBTOT,0…999999999,9,,,,",
    "2,Grado promedio,Promedio escolar,GRAPROES,0…99,5,,,,",
  ].join("\n");

  const indicators = parseIterDictionary(dictionaryText, [
    "ENTIDAD",
    "NOM_ENT",
    "POBTOT",
    "GRAPROES",
  ]);

  assert.deepEqual(
    indicators.map(({ mnemonic, logicalType, order }) => ({ mnemonic, logicalType, order })),
    [
      { mnemonic: "ENTIDAD", logicalType: "TEXTO", order: 0 },
      { mnemonic: "NOM_ENT", logicalType: "TEXTO", order: 1 },
      { mnemonic: "POBTOT", logicalType: "ENTERO", order: 2 },
      { mnemonic: "GRAPROES", logicalType: "DECIMAL", order: 3 },
    ]
  );
});
