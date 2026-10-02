import { createHash } from "node:crypto";

const SHA256 = /^[a-f0-9]{64}$/u;
const TABLE_NAME = /^public\.[a-z_][a-z0-9_$]*$/u;
const SEQUENCE_NAME = /^public\.[a-z_][a-z0-9_$]*_seq$/u;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function evidence(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function validateSequence(sequence, table) {
  if (
    !SEQUENCE_NAME.test(sequence?.name ?? "") ||
    !Number.isSafeInteger(sequence?.lastValue) ||
    sequence.lastValue < 0 ||
    typeof sequence?.isCalled !== "boolean"
  ) {
    throw new Error(`Invalid sequence state for ${table}`);
  }
  return {
    name: sequence.name,
    lastValue: sequence.lastValue,
    isCalled: sequence.isCalled,
  };
}

function normalizeReport(report) {
  if (
    report?.contractVersion !== 1 ||
    report?.kind !== "promotion_preseeded_catalogs" ||
    !Array.isArray(report.tables)
  ) {
    throw new Error("Invalid preseeded report contract");
  }
  const seen = new Set();
  const tables = report.tables.map((entry) => {
    if (!TABLE_NAME.test(entry?.table ?? "") || seen.has(entry.table)) {
      throw new Error(`Invalid or duplicate preseeded table: ${String(entry?.table)}`);
    }
    seen.add(entry.table);
    if (!Number.isSafeInteger(entry.rowCount) || entry.rowCount < 0) {
      throw new Error(`Invalid row count for ${entry.table}`);
    }
    if (!SHA256.test(entry.rowsSha256 ?? "")) {
      throw new Error(`Invalid rows SHA-256 for ${entry.table}`);
    }
    if (!Array.isArray(entry.sequences)) {
      throw new Error(`Invalid sequence list for ${entry.table}`);
    }
    const sequenceNames = new Set();
    const sequences = entry.sequences
      .map((sequence) => validateSequence(sequence, entry.table))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const sequence of sequences) {
      if (sequenceNames.has(sequence.name)) {
        throw new Error(`Duplicate sequence in ${entry.table}: ${sequence.name}`);
      }
      sequenceNames.add(sequence.name);
    }
    return {
      table: entry.table,
      rowCount: entry.rowCount,
      rowsSha256: entry.rowsSha256,
      sequences,
    };
  }).sort((left, right) => left.table.localeCompare(right.table));
  return { contractVersion: 1, kind: "promotion_preseeded_catalogs", tables };
}

export function parsePreseededReport(stdout) {
  let value;
  try {
    value = JSON.parse(String(stdout ?? "").trim());
  } catch {
    throw new Error("Preseeded probe must return JSON");
  }
  if (Array.isArray(value?.rows) && value.rows.length === 1) {
    const candidates = Object.values(value.rows[0] ?? {}).filter(
      (candidate) => candidate?.kind === "promotion_preseeded_catalogs",
    );
    if (candidates.length !== 1) {
      throw new Error("Preseeded query wrapper must contain exactly one report");
    }
    [value] = candidates;
  }
  return normalizeReport(value);
}

function expectedShape(expectedTables) {
  if (!Array.isArray(expectedTables)) throw new Error("Expected preseeded tables are required");
  const seen = new Set();
  return expectedTables.map((entry) => {
    if (!TABLE_NAME.test(entry?.table ?? "") || seen.has(entry.table)) {
      throw new Error(`Invalid or duplicate expected preseeded table: ${String(entry?.table)}`);
    }
    seen.add(entry.table);
    if (
      !Array.isArray(entry.ownedSequences) ||
      entry.ownedSequences.some((name) => !SEQUENCE_NAME.test(name)) ||
      new Set(entry.ownedSequences).size !== entry.ownedSequences.length
    ) {
      throw new Error(`Invalid expected sequence set for ${entry.table}`);
    }
    return {
      table: entry.table,
      ownedSequences: [...entry.ownedSequences].sort(),
    };
  }).sort((left, right) => left.table.localeCompare(right.table));
}

function assertExpectedShape(report, expected) {
  if (
    report.tables.length !== expected.length ||
    report.tables.some((entry, index) => entry.table !== expected[index].table)
  ) {
    throw new Error("Preseeded report table set does not match expected tables");
  }
  for (let index = 0; index < expected.length; index += 1) {
    const actualNames = report.tables[index].sequences.map(({ name }) => name);
    if (JSON.stringify(actualNames) !== JSON.stringify(expected[index].ownedSequences)) {
      throw new Error(`Preseeded report sequence set does not match ${expected[index].table}`);
    }
  }
}

export function comparePreseededReports({ source, target, expectedTables }) {
  const normalizedSource = normalizeReport(source);
  const normalizedTarget = normalizeReport(target);
  const expected = expectedShape(expectedTables);
  assertExpectedShape(normalizedSource, expected);
  assertExpectedShape(normalizedTarget, expected);

  const issues = [];
  for (let index = 0; index < expected.length; index += 1) {
    const sourceEntry = normalizedSource.tables[index];
    const targetEntry = normalizedTarget.tables[index];
    if (sourceEntry.rowCount !== targetEntry.rowCount) {
      issues.push({ code: "ROW_COUNT_MISMATCH", detail: sourceEntry.table });
    }
    if (sourceEntry.rowsSha256 !== targetEntry.rowsSha256) {
      issues.push({ code: "ROW_HASH_MISMATCH", detail: sourceEntry.table });
    }
    if (JSON.stringify(sourceEntry.sequences) !== JSON.stringify(targetEntry.sequences)) {
      issues.push({ code: "SEQUENCE_STATE_MISMATCH", detail: sourceEntry.table });
    }
  }
  return {
    status: issues.length === 0 ? "PASSED" : "BLOCKED",
    evidenceSha256: evidence({ source: normalizedSource, target: normalizedTarget, expected }),
    issues,
  };
}
