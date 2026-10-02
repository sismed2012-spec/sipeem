import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");

async function withIgnoreFixture(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sipeem-vercel-ignore-"));
  try {
    const init = spawnSync("git", ["init", "--quiet"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(init.status, 0, init.stderr);
    const rules = await readFile(path.join(repoRoot, ".vercelignore"), "utf8");
    await writeFile(path.join(root, ".gitignore"), rules, "utf8");
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function createFixtureFile(root, relativePath) {
  const filePath = path.join(root, ...relativePath.split("/"));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "fixture", "utf8");
}

function isIgnored(root, relativePath) {
  const result = spawnSync(
    "git",
    ["check-ignore", "--no-index", "--quiet", relativePath],
    { cwd: root, encoding: "utf8" },
  );
  assert.ok(
    result.status === 0 || result.status === 1,
    `git check-ignore failed for ${relativePath}: ${result.stderr}`,
  );
  return result.status === 0;
}

test("Vercel package excludes territorial runtime evidence but keeps source", async () => {
  await withIgnoreFixture(async (root) => {
    const ignoredRuntimeFiles = [
      "infra/territorial/artifacts/hash/territorial-data.sql",
      "infra/territorial/journals/hash.json",
      "infra/territorial/supabase/.temp/profile",
      ".superpowers/sdd/plan/progress.md",
    ];
    const requiredSourceFiles = [
      "src/app/layout.tsx",
      "infra/territorial/supabase/migrations/20260912034453_extensions.sql",
    ];

    for (const relativePath of [...ignoredRuntimeFiles, ...requiredSourceFiles]) {
      await createFixtureFile(root, relativePath);
    }

    for (const relativePath of ignoredRuntimeFiles) {
      assert.equal(isIgnored(root, relativePath), true, relativePath);
    }
    for (const relativePath of requiredSourceFiles) {
      assert.equal(isIgnored(root, relativePath), false, relativePath);
    }
  });
});
