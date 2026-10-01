import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OPERATIONAL_MIGRATION = /^\d{3}_[a-z0-9_]+\.sql$/u;
const TERRITORIAL_MIGRATION = /^202609\d{8}_[a-z0-9_]+\.sql$/u;
const ABSOLUTE_PATH = /(?:\b[a-z]:[\\/]{1,2}|(?:^|[\s'"(])\\\\[^\s'";]+)/iu;

async function listSqlFiles(directory) {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function readIfPresent(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function inspectTerritorialLayout(rootDir) {
  const operationalDirectory = path.join(rootDir, "supabase", "migrations");
  const territorialRoot = path.join(rootDir, "infra", "territorial", "supabase");
  const territorialDirectory = path.join(territorialRoot, "migrations");
  const testsDirectory = path.join(territorialRoot, "tests");
  const configPath = path.join(territorialRoot, "config.toml");

  const [operationalFiles, territorialFiles, testFiles, config] =
    await Promise.all([
      listSqlFiles(operationalDirectory),
      listSqlFiles(territorialDirectory),
      listSqlFiles(testsDirectory),
      readIfPresent(configPath),
    ]);
  const errors = [];

  const misplacedTerritorial = operationalFiles.filter((name) =>
    TERRITORIAL_MIGRATION.test(name),
  );
  if (misplacedTerritorial.length > 0) {
    errors.push(
      `Territorial migration found in operational workdir: ${misplacedTerritorial.join(", ")}`,
    );
  }
  const misplacedOperational = territorialFiles.filter((name) =>
    OPERATIONAL_MIGRATION.test(name),
  );
  if (misplacedOperational.length > 0) {
    errors.push(
      `Operational migration found in territorial workdir: ${misplacedOperational.join(", ")}`,
    );
  }

  const operationalMigrations = operationalFiles.filter((name) =>
    OPERATIONAL_MIGRATION.test(name),
  );
  const territorialMigrations = territorialFiles.filter((name) =>
    TERRITORIAL_MIGRATION.test(name),
  );
  if (operationalMigrations.length !== 19) {
    errors.push(
      `Expected 19 operational migrations, found ${operationalMigrations.length}`,
    );
  }
  if (territorialMigrations.length !== 49) {
    errors.push(
      `Expected 49 territorial migrations, found ${territorialMigrations.length}`,
    );
  }
  if (testFiles.length !== 23) {
    errors.push(`Expected 23 territorial tests, found ${testFiles.length}`);
  }

  if (config === null) {
    errors.push("Territorial config.toml is required");
  } else {
    if (!/^project_id\s*=\s*"sipeem-territorial"\s*$/mu.test(config)) {
      errors.push('config.toml must declare project_id = "sipeem-territorial"');
    }
    if (!/^schemas\s*=\s*\[\s*"public"\s*\]\s*$/mu.test(config)) {
      errors.push("config.toml must expose only public through the Data API");
    }
    if (!/^extra_search_path\s*=\s*\[\s*"public"\s*,\s*"extensions"\s*,\s*"territorial_private"\s*\]\s*$/mu.test(config)) {
      errors.push(
        "config.toml extra_search_path must include public, extensions, and territorial_private",
      );
    }
  }

  const portableFiles = [
    ...(config === null ? [] : [[configPath, config]]),
    ...(
      await Promise.all(
        [...territorialMigrations.map((name) => path.join(territorialDirectory, name)),
          ...testFiles.map((name) => path.join(testsDirectory, name))].map(
          async (filePath) => [filePath, await readFile(filePath, "utf8")],
        ),
      )
    ),
  ];
  for (const [filePath, contents] of portableFiles) {
    if (ABSOLUTE_PATH.test(contents)) {
      errors.push(`Absolute path found in ${path.relative(rootDir, filePath)}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    operationalMigrations: operationalMigrations.length,
    territorialMigrations: territorialMigrations.length,
    territorialTests: testFiles.length,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0] !== "--check") {
    throw new Error("Usage: node scripts/territorial-promotion/layout.mjs --check");
  }
  const report = await inspectTerritorialLayout(process.cwd());
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url).toLowerCase() ===
    path.resolve(process.argv[1]).toLowerCase();

if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
