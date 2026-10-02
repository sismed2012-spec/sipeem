import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  assertSafeArchiveEntries,
  inspectShpHeader,
  inventoryLayer,
} from "./archive.mjs";

describe("cartography archive inspection", () => {
  it("rejects archive traversal and absolute entries", () => {
    assert.doesNotThrow(() => assertSafeArchiveEntries(["15 MEXICO/SECCION.shp"]));
    assert.throws(() => assertSafeArchiveEntries(["../outside.txt"]), /unsafe archive/i);
    assert.throws(() => assertSafeArchiveEntries(["C:/outside.txt"]), /unsafe archive/i);
    assert.throws(() => assertSafeArchiveEntries(["/outside.txt"]), /unsafe archive/i);
  });

  it("counts SHP records and maps polygon storage to MultiPolygon", () => {
    const payload = Buffer.alloc(100 + 8 + 16 + 8 + 12);
    payload.writeInt32BE(9994, 0);
    payload.writeInt32LE(1000, 28);
    payload.writeInt32LE(5, 32);
    payload.writeInt32BE(8, 104);
    payload.writeInt32BE(6, 128);
    assert.deepEqual(inspectShpHeader(payload), {
      records: 2,
      sourceShapeType: 5,
      geometryType: "MultiPolygon",
    });
  });

  it("inventories exact canonical components, hashes and DBF LDID", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sipeem-cartography-test-"));
    try {
      const dbf = Buffer.alloc(33);
      dbf.writeUInt32LE(0, 4);
      dbf.writeUInt16LE(33, 8);
      dbf.writeUInt8(0x57, 29);
      dbf.writeUInt8(0x0d, 32);
      const shp = Buffer.alloc(100);
      shp.writeInt32BE(9994, 0);
      shp.writeInt32LE(1000, 28);
      shp.writeInt32LE(5, 32);
      await writeFile(path.join(root, "COLONIA.dbf"), dbf);
      await writeFile(path.join(root, "COLONIA.shp"), shp);
      await writeFile(path.join(root, "COLONIA.shx"), Buffer.from("index"));
      await writeFile(path.join(root, "COLONIA.prj"), Buffer.from("WGS_1984_UTM_Zone_14N"));

      const item = await inventoryLayer(root, "BGD", "COLONIA", {
        explicitEncoding: "Windows-1252",
      });
      assert.equal(item.records, 0);
      assert.equal(item.geometryType, "MultiPolygon");
      assert.equal(item.encoding, "windows-1252");
      assert.equal(item.encodingOrigin, "OVERRIDE_EXPLICITO");
      assert.equal(item.ldid, 0x57);
      assert.equal(item.components.length, 4);
      assert.ok(item.components.every((component) => /^[0-9a-f]{64}$/.test(component.sha256)));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
