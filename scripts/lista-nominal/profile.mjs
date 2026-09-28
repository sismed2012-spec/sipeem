import { pathToFileURL } from "node:url";

import { readListaNominalWorkbook } from "./ine-parser.mjs";

const EXPECTED = Object.freeze({
  sourceHash:
    "d016713ed9304ae696fbcf875141cf8268799d05468f1afb79bb8785227de161",
  cutoffDate: "2026-07-31",
  sections: 7191,
  municipalities: 125,
  federalDistricts: 40,
  localDistricts: 45,
  padron: 13_407_250,
  nominal: 13_206_301,
  difference: 200_949,
});

const COUNT_FIELDS = [
  "padronHombres",
  "padronMujeres",
  "padronNoBinario",
  "padronTotal",
  "listaHombres",
  "listaMujeres",
  "listaNoBinario",
  "listaTotal",
  "diferencia",
];

function validateArithmetic(row) {
  for (const field of COUNT_FIELDS) {
    if (!Number.isSafeInteger(row[field]) || row[field] < 0) {
      throw new Error(
        `Fila ${row.sourceRow}: ${field} debe ser un entero no negativo`,
      );
    }
  }

  const padronBySex =
    row.padronHombres + row.padronMujeres + row.padronNoBinario;
  if (row.padronTotal !== padronBySex) {
    throw new Error(
      `Fila ${row.sourceRow}: el padrón total no coincide con la suma por sexos`,
    );
  }

  const nominalBySex =
    row.listaHombres + row.listaMujeres + row.listaNoBinario;
  if (row.listaTotal !== nominalBySex) {
    throw new Error(
      `Fila ${row.sourceRow}: la lista nominal total no coincide con la suma por sexos`,
    );
  }

  if (row.diferencia !== row.padronTotal - row.listaTotal) {
    throw new Error(
      `Fila ${row.sourceRow}: la diferencia no coincide con padrón menos lista nominal`,
    );
  }

  const expectedCoverage =
    row.padronTotal === 0 ? 0 : (row.listaTotal / row.padronTotal) * 100;
  if (
    !Number.isFinite(row.cobertura) ||
    Math.abs(row.cobertura - expectedCoverage) > 1e-7
  ) {
    throw new Error(
      `Fila ${row.sourceRow}: la cobertura no coincide con lista nominal entre padrón`,
    );
  }
}

export function buildListaNominalProfile(archive) {
  if (!archive?.foreignResidents) {
    throw new Error("Falta la fila de residentes en el extranjero");
  }
  if (archive.foreignResidents.seccion !== "0000") {
    throw new Error("La fila de residentes en el extranjero debe ser la sección 0000");
  }
  validateArithmetic(archive.foreignResidents);

  const businessKeys = new Map();
  const municipalities = new Set();
  const federalDistricts = new Set();
  const localDistricts = new Set();
  let padron = 0;
  let nominal = 0;
  let difference = 0;

  for (const section of archive.sections ?? []) {
    if (section.seccion === "0000") {
      throw new Error(
        `Fila ${section.sourceRow}: la sección 0000 sólo puede representar residentes en el extranjero`,
      );
    }
    validateArithmetic(section);
    const businessKey = `${section.municipioClave}:${section.seccion}`;
    const previousRow = businessKeys.get(businessKey);
    if (previousRow) {
      throw new Error(
        `Sección duplicada ${section.municipioClave}/${section.seccion} en filas ${previousRow} y ${section.sourceRow}`,
      );
    }
    businessKeys.set(businessKey, section.sourceRow);
    municipalities.add(section.municipioClave);
    federalDistricts.add(section.distritoFederal);
    localDistricts.add(section.distritoLocal);
    padron += section.padronTotal;
    nominal += section.listaTotal;
    difference += section.diferencia;
  }

  if (difference !== padron - nominal) {
    throw new Error(
      "La diferencia agregada no coincide con padrón menos lista nominal",
    );
  }

  return {
    sourceHash: archive.sourceHash,
    sheetName: archive.sheetName,
    cutoffDate: archive.cutoffDate,
    sections: archive.sections?.length ?? 0,
    municipalities: municipalities.size,
    federalDistricts: federalDistricts.size,
    localDistricts: localDistricts.size,
    padron,
    nominal,
    difference,
    coverage: padron === 0 ? 0 : (nominal / padron) * 100,
    foreignResidents: {
      padron: archive.foreignResidents.padronTotal,
      nominal: archive.foreignResidents.listaTotal,
      difference: archive.foreignResidents.diferencia,
      coverage: archive.foreignResidents.cobertura,
      sourceRow: archive.foreignResidents.sourceRow,
    },
  };
}

export function assertExpectedListaNominalProfile(profile) {
  for (const [field, expected] of Object.entries(EXPECTED)) {
    if (profile?.[field] !== expected) {
      throw new Error(
        `Perfil INE inesperado para ${field}: esperado ${expected}, recibido ${profile?.[field]}`,
      );
    }
  }
  return profile;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error("Uso: node profile.mjs <archivo.xlsx>");
  }
  const archive = await readListaNominalWorkbook(filePath);
  const profile = assertExpectedListaNominalProfile(
    buildListaNominalProfile(archive),
  );
  process.stdout.write(`${JSON.stringify(profile, null, 2)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
