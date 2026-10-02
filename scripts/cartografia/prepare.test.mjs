import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { parseLayerFeatures } from "./prepare.mjs";

test("feature parsing rejects a component changed after inventory", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sipeem-cartografia-component-"));
  try {
    const shpPath = path.join(root, "LOCALIDAD.shp");
    const dbfPath = path.join(root, "LOCALIDAD.dbf");
    await writeFile(shpPath, Buffer.from("changed-shp"));
    await writeFile(dbfPath, Buffer.from("changed-dbf"));
    const layer = {
      product: "BGD",
      name: "LOCALIDAD",
      records: 1,
      encoding: "windows-1252",
      components: [
        { extension: "shp", path: shpPath, sha256: "a".repeat(64) },
        { extension: "dbf", path: dbfPath, sha256: "b".repeat(64) },
      ],
    };
    await assert.rejects(parseLayerFeatures(layer), /changed after inventory/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
