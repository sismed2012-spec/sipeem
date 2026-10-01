import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { inspectTerritorialLayout } from "./layout.mjs";

const temporaryDirectories = [];

after(async () => {
  for (const directory of temporaryDirectories) {
    assert.ok(directory.startsWith(os.tmpdir()));
    await rm(directory, { recursive: true, force: true });
  }
});

async function write(relativePath, content = "select 1;\n") {
  const filePath = path.join(temporaryDirectories.at(-1), relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

async function createValidLayout() {
  const root = await mkdtemp(path.join(os.tmpdir(), "territorial-layout-"));
  temporaryDirectories.push(root);

  for (let index = 1; index <= 19; index += 1) {
    await write(
      `supabase/migrations/${String(index).padStart(3, "0")}_operational.sql`,
    );
  }
  for (let index = 1; index <= 49; index += 1) {
    await write(
      `infra/territorial/supabase/migrations/202609${String(index).padStart(8, "0")}_territorial.sql`,
    );
  }
  for (let index = 1; index <= 23; index += 1) {
    await write(
      `infra/territorial/supabase/tests/territorial_${String(index).padStart(2, "0")}.sql`,
    );
  }
  await write(
    "infra/territorial/supabase/config.toml",
    'project_id = "sipeem-territorial"\n[api]\nschemas = ["public"]\nextra_search_path = ["public", "extensions", "territorial_private"]\n',
  );
  return root;
}

test("accepts only the isolated 19/49/23 operational-territorial layout", async () => {
  const root = await createValidLayout();

  const report = await inspectTerritorialLayout(root);

  assert.deepEqual(report, {
    ok: true,
    errors: [],
    operationalMigrations: 19,
    territorialMigrations: 49,
    territorialTests: 23,
  });
});

test("rejects migrations placed in the opposite workdir", async () => {
  const root = await createValidLayout();
  await write("supabase/migrations/20260999999999_wrong.sql");
  await write("infra/territorial/supabase/migrations/001_wrong.sql");

  const report = await inspectTerritorialLayout(root);

  assert.equal(report.ok, false);
  assert.match(report.errors.join("\n"), /territorial migration.*operational workdir/i);
  assert.match(report.errors.join("\n"), /operational migration.*territorial workdir/i);
});

test("rejects missing counts, config, and absolute paths", async () => {
  const root = await createValidLayout();
  await rm(
    path.join(root, "infra/territorial/supabase/tests/territorial_23.sql"),
  );
  await rm(path.join(root, "infra/territorial/supabase/config.toml"));
  await write(
    "infra/territorial/supabase/migrations/20260900000001_absolute.sql",
    "select 'C:\\\\Users\\\\example\\\\secret';\n",
  );

  const report = await inspectTerritorialLayout(root);

  assert.equal(report.ok, false);
  assert.match(report.errors.join("\n"), /expected 49 territorial migrations, found 50/i);
  assert.match(report.errors.join("\n"), /expected 23 territorial tests, found 22/i);
  assert.match(report.errors.join("\n"), /config\.toml is required/i);
  assert.match(report.errors.join("\n"), /absolute path/i);
});

test("rejects exposing territorial_private through the Data API", async () => {
  const root = await createValidLayout();
  await write(
    "infra/territorial/supabase/config.toml",
    'project_id = "sipeem-territorial"\n[api]\nschemas = ["public", "territorial_private"]\nextra_search_path = ["public", "extensions"]\n',
  );

  const report = await inspectTerritorialLayout(root);

  assert.equal(report.ok, false);
  assert.match(report.errors.join("\n"), /must expose only public/i);
});
