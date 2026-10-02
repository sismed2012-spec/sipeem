import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { classifyIterRow, parseIterValue, readIterArchive } from "./iter-parser.mjs";

function localityKey(row) {
  return `${row.ENTIDAD}-${row.MUN}-${row.LOC}`;
}

export function buildIterProfile(archive) {
  const counts = {
    stateTotals: 0,
    municipalityTotals: 0,
    realLocalities: 0,
    specialRows: 0,
  };
  const seen = new Set();
  const duplicates = new Set();
  const missingCoordinateRows = [];
  let totalPopulation = null;
  let reservedCellCount = 0;

  for (const row of archive.rows) {
    const classification = classifyIterRow(row);
    if (classification === "STATE_TOTAL") {
      counts.stateTotals += 1;
      totalPopulation = parseIterValue(row.POBTOT).value;
    } else if (classification === "MUNICIPAL_TOTAL") {
      counts.municipalityTotals += 1;
    } else if (classification === "LOCALITY") {
      counts.realLocalities += 1;
      const key = localityKey(row);
      if (seen.has(key)) duplicates.add(key);
      seen.add(key);
      if (!String(row.LONGITUD ?? "").trim() || !String(row.LATITUD ?? "").trim()) {
        missingCoordinateRows.push(key);
      }
    } else if (classification === "SPECIAL_9998" || classification === "SPECIAL_9999") {
      counts.specialRows += 1;
    }

    reservedCellCount += Object.values(row).filter((value) => value === "*").length;
  }

  return {
    totalRows: archive.rows.length,
    columnCount: archive.headers.length,
    ...counts,
    totalPopulation,
    reservedCellCount,
    duplicateLocalityKeys: [...duplicates].sort(),
    missingCoordinateRows,
  };
}

const EXPECTED_ITER_PROFILE = {
  totalRows: 5136,
  columnCount: 286,
  stateTotals: 1,
  municipalityTotals: 125,
  realLocalities: 4894,
  specialRows: 116,
  totalPopulation: 16992418,
};

export function assertExpectedIterProfile(profile) {
  for (const [field, expected] of Object.entries(EXPECTED_ITER_PROFILE)) {
    if (profile[field] !== expected) {
      throw new Error(`${field}: expected ${expected}, received ${profile[field]}`);
    }
  }
  if (profile.duplicateLocalityKeys.length > 0) {
    throw new Error(
      `duplicateLocalityKeys: expected none, received ${profile.duplicateLocalityKeys.length}`
    );
  }
  if (profile.missingCoordinateRows.length > 0) {
    throw new Error(
      `missingCoordinateRows: expected none, received ${profile.missingCoordinateRows.length}`
    );
  }
  return profile;
}

async function runCli() {
  const [, , zipPath, ...args] = process.argv;
  if (!zipPath) {
    throw new Error("Usage: node scripts/demografia/profile.mjs <zip> [--out <file>]");
  }
  const outIndex = args.indexOf("--out");
  const outPath = outIndex >= 0 ? args[outIndex + 1] : null;
  if (outIndex >= 0 && !outPath) throw new Error("--out requires a file path");

  const archive = await readIterArchive(zipPath);
  const profile = assertExpectedIterProfile(buildIterProfile(archive));
  const result = {
    sourceHash: archive.sourceHash,
    members: archive.members,
    encodings: archive.encodings,
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
