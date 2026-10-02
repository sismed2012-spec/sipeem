import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readEcegWorkbook } from "./eceg-parser.mjs";

const POPULATION_INDICATOR = "poblacion_poblacion_total";

export function buildEcegProfile(parsed) {
  const municipalities = new Set();
  const districts = new Set();
  const sectionsMissingPopulation = [];
  const sectionsWithUnexpectedIndicatorCount = [];
  let totalPopulation = 0;
  let presentCellCount = 0;
  let reservedCellCount = 0;
  let absentCellCount = 0;
  let zeroValueCount = 0;

  for (const section of parsed.sections) {
    municipalities.add(section.geography.municipalityCode);
    districts.add(section.geography.district);
    const values = Object.values(section.indicators);
    if (values.length !== parsed.indicators.length) {
      sectionsWithUnexpectedIndicatorCount.push(section.geography.sectionNumber);
    }
    for (const cell of values) {
      if (cell.status === "PRESENTE") {
        presentCellCount += 1;
        if (cell.value === 0) zeroValueCount += 1;
      } else if (cell.status === "RESERVADO") {
        reservedCellCount += 1;
      } else if (cell.status === "AUSENTE") {
        absentCellCount += 1;
      }
    }
    const population = section.indicators[POPULATION_INDICATOR];
    if (!population || population.status !== "PRESENTE") {
      sectionsMissingPopulation.push(section.geography.sectionNumber);
    } else {
      totalPopulation += population.value;
    }
  }

  return {
    sectionCount: parsed.sections.length,
    indicatorCount: parsed.indicators.length,
    municipalityCount: municipalities.size,
    districtCount: districts.size,
    totalPopulation,
    presentCellCount,
    reservedCellCount,
    absentCellCount,
    zeroValueCount,
    sectionsMissingPopulation: sectionsMissingPopulation.sort(),
    sectionsWithUnexpectedIndicatorCount:
      sectionsWithUnexpectedIndicatorCount.sort(),
  };
}

const EXPECTED_ECEG_PROFILE = {
  sectionCount: 6544,
  indicatorCount: 220,
  municipalityCount: 125,
  districtCount: 41,
  totalPopulation: 16992418,
};

export function assertExpectedEcegProfile(profile) {
  for (const [field, expected] of Object.entries(EXPECTED_ECEG_PROFILE)) {
    if (profile[field] !== expected) {
      throw new Error(`${field}: expected ${expected}, received ${profile[field]}`);
    }
  }
  for (const field of [
    "sectionsMissingPopulation",
    "sectionsWithUnexpectedIndicatorCount",
  ]) {
    if (profile[field].length > 0) {
      throw new Error(`${field}: expected none, received ${profile[field].length}`);
    }
  }
  return profile;
}

async function runCli() {
  const [, , workbookPath, ...args] = process.argv;
  if (!workbookPath) {
    throw new Error(
      "Usage: node scripts/demografia/eceg-profile.mjs <xlsx> [--out <file>]"
    );
  }
  const outIndex = args.indexOf("--out");
  const outPath = outIndex >= 0 ? args[outIndex + 1] : null;
  if (outIndex >= 0 && !outPath) throw new Error("--out requires a file path");

  const parsed = await readEcegWorkbook(workbookPath);
  const profile = assertExpectedEcegProfile(buildEcegProfile(parsed));
  const result = {
    sourceHash: parsed.sourceHash,
    sheetSchemas: parsed.sheetSchemas,
    ...profile,
  };
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (outPath) {
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, serialized, "utf8");
  }
  process.stdout.write(serialized);
}

const isMain = process.argv[1]
  && fileURLToPath(import.meta.url).toLowerCase() === path.resolve(process.argv[1]).toLowerCase();

if (isMain) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
