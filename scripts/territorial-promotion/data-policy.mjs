import { createHash } from "node:crypto";

import { SOURCE_PROJECT_REF } from "./policy.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const TABLE_NAME = /^public\.[a-z_][a-z0-9_$]*$/u;
const REQUIRED_EXCLUSIONS = new Set([
  "public.staging_electoral_incidencias",
  "public.staging_electoral_registros",
  "public.staging_electoral_resultados",
]);

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize).sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function policyInventoryShape(inventory) {
  if (
    inventory?.contractVersion !== 1 ||
    inventory?.kind !== "promotion_data_inventory" ||
    !Array.isArray(inventory.tables) ||
    !Array.isArray(inventory.foreignKeys) ||
    !Array.isArray(inventory.sequences) ||
    !Array.isArray(inventory.dependencies)
  ) {
    throw new Error("Invalid source inventory contract");
  }
  return {
    tables: inventory.tables.map((table) => ({
      name: table.name,
      primaryKey: table.primaryKey ?? [],
    })),
    foreignKeys: inventory.foreignKeys,
    sequences: inventory.sequences.map((sequence) => ({
      name: sequence.name,
      dataType: sequence.dataType ?? null,
      cycle: sequence.cycle ?? false,
    })),
    dependencies: inventory.dependencies,
  };
}

export function computeInventoryFingerprint(inventory) {
  const content = canonicalize(policyInventoryShape(inventory));
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

function validatePolicyEntry(entry, category) {
  if (!TABLE_NAME.test(entry?.table ?? "")) {
    throw new Error(`Invalid ${category} table name: ${String(entry?.table)}`);
  }
  if (typeof entry.reason !== "string" || entry.reason.trim().length < 3) {
    throw new Error(`Every ${category} entry requires an exact reason`);
  }
}

function dependencyIsDocumented(entry, foreignKey) {
  return (entry.documentedIncomingDependencies ?? []).some(
    (dependency) =>
      dependency?.fromTable === foreignKey.fromTable &&
      dependency?.constraint === foreignKey.name &&
      typeof dependency.reason === "string" &&
      dependency.reason.trim().length >= 10,
  );
}

export function classifySourceTables({ inventory, dataPolicy }) {
  const actualFingerprint = computeInventoryFingerprint(inventory);
  if (
    dataPolicy?.contractVersion !== 1 ||
    !SHA256.test(dataPolicy.sourceInventorySha256 ?? "")
  ) {
    throw new Error("Invalid data policy contract or inventory fingerprint");
  }
  if (dataPolicy.sourceProjectRef !== SOURCE_PROJECT_REF) {
    throw new Error("Data policy source project must exactly match SIPEEM-DEV");
  }
  if (dataPolicy.sourceInventorySha256 !== actualFingerprint) {
    throw new Error("Source inventory fingerprint does not match the reviewed policy");
  }
  if (!Array.isArray(dataPolicy.include) || !Array.isArray(dataPolicy.exclude)) {
    throw new Error("Data policy must define include and exclude arrays");
  }

  const observed = new Set();
  for (const table of inventory.tables) {
    if (!TABLE_NAME.test(table?.name ?? "") || observed.has(table.name)) {
      throw new Error(`Invalid or duplicate inventory table: ${String(table?.name)}`);
    }
    observed.add(table.name);
  }

  const classified = new Map();
  for (const [category, entries] of [
    ["include", dataPolicy.include],
    ["exclude", dataPolicy.exclude],
  ]) {
    for (const entry of entries) {
      validatePolicyEntry(entry, category);
      if (classified.has(entry.table)) {
        throw new Error(`Duplicate data policy table: ${entry.table}`);
      }
      if (!observed.has(entry.table)) {
        throw new Error(`Unknown data policy table: ${entry.table}`);
      }
      classified.set(entry.table, { category, entry });
    }
  }
  const missing = [...observed].filter((table) => !classified.has(table));
  if (missing.length > 0) {
    throw new Error(`Missing data policy classification: ${missing.sort().join(", ")}`);
  }
  for (const table of REQUIRED_EXCLUSIONS) {
    if (classified.get(table)?.category !== "exclude") {
      throw new Error(`Required exclusion is not excluded: ${table}`);
    }
  }

  for (const foreignKey of inventory.foreignKeys) {
    const from = classified.get(foreignKey.fromTable);
    const to = classified.get(foreignKey.toTable);
    if (from?.category === "include" && to?.category === "exclude") {
      if (!dependencyIsDocumented(to.entry, foreignKey)) {
        throw new Error(
          `Foreign key ${foreignKey.name} crosses included ${foreignKey.fromTable} to excluded ${foreignKey.toTable}`,
        );
      }
    }
  }

  return {
    include: [...classified]
      .filter(([, value]) => value.category === "include")
      .map(([table]) => table)
      .sort(),
    exclude: [...classified]
      .filter(([, value]) => value.category === "exclude")
      .map(([table]) => table)
      .sort(),
    inventorySha256: actualFingerprint,
  };
}
