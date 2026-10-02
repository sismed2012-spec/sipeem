import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCartographyManifest,
  parseDbfHeader,
  resolveDbfEncoding,
} from "./profile.mjs";

function dbfHeader({ records, fields }) {
  const headerLength = 32 + fields.length * 32 + 1;
  const payload = Buffer.alloc(headerLength);
  payload.writeUInt8(0x03, 0);
  payload.writeUInt32LE(records, 4);
  payload.writeUInt16LE(headerLength, 8);
  let offset = 32;
  for (const field of fields) {
    payload.write(field.name, offset, 11, "ascii");
    payload.write(field.type, offset + 11, 1, "ascii");
    payload.writeUInt8(field.length, offset + 16);
    payload.writeUInt8(field.decimals ?? 0, offset + 17);
    offset += 32;
  }
  payload.writeUInt8(0x0d, offset);
  return payload;
}

function layer(product, name, records, overrides = {}) {
  const extensions = overrides.extensions ??
    (product === "MGS" ? ["shp", "shx", "dbf", "prj", "cpg"] : ["shp", "shx", "dbf", "prj"]);
  return {
    product,
    name,
    records,
    geometryType: overrides.geometryType ?? (name === "LOCALIDAD" ? "Point" : "MultiPolygon"),
    encoding: overrides.encoding ?? (product === "MGS" ? "utf-8" : "windows-1252"),
    components: extensions.map((extension) => ({
      name: `${name}.${extension}`,
      extension,
      bytes: 100,
      sha256: "c".repeat(64),
      declaredRecords: extension === "dbf" ? records : null,
    })),
  };
}

describe("cartography package preflight", () => {
  it("reads the DBF record count and field contract from the binary header", () => {
    const result = parseDbfHeader(dbfHeader({
      records: 7_052,
      fields: [
        { name: "ENTIDAD", type: "N", length: 6 },
        { name: "NOMBRE", type: "C", length: 80 },
      ],
    }));

    assert.deepEqual(result, {
      records: 7_052,
      fields: [
        { name: "ENTIDAD", type: "N", length: 6, decimals: 0 },
        { name: "NOMBRE", type: "C", length: 80, decimals: 0 },
      ],
    });
  });

  it("requires an explicit encoding when a BGD text layer has no CPG", () => {
    assert.throws(
      () => resolveDbfEncoding({ layer: "COLONIA", cpg: null, explicitEncoding: null }),
      /explicit encoding.*COLONIA/i,
    );
    assert.equal(
      resolveDbfEncoding({ layer: "COLONIA", cpg: null, explicitEncoding: "Windows-1252" }),
      "windows-1252",
    );
    assert.equal(
      resolveDbfEncoding({ layer: "SECCION", cpg: "UTF-8", explicitEncoding: null }),
      "utf-8",
    );
  });

  it("builds the closed MGS/BGD manifest and loads only the eight canonical layers", () => {
    const mgs = [
      layer("MGS", "ENTIDAD", 1),
      layer("MGS", "MUNICIPIO", 125),
      layer("MGS", "DISTRITO_LOCAL", 45),
      layer("MGS", "DISTRITO_FEDERAL", 40),
      layer("MGS", "SECCION", 7_052),
    ];
    const bgd = [
      layer("BGD", "ENTIDAD", 1, { extensions: ["shp", "shx", "dbf", "prj", "cpg"] }),
      layer("BGD", "MUNICIPIO", 125, { extensions: ["shp", "shx", "dbf", "prj", "cpg"] }),
      layer("BGD", "DISTRITO_LOCAL", 45, { extensions: ["shp", "shx", "dbf", "prj", "cpg"] }),
      layer("BGD", "DISTRITO_FEDERAL", 40, { extensions: ["shp", "shx", "dbf", "prj", "cpg"] }),
      layer("BGD", "SECCION", 7_052, { extensions: ["shp", "shx", "dbf", "prj", "cpg"] }),
      layer("BGD", "COLONIA", 7_367),
      layer("BGD", "LOCALIDAD", 3_639),
      layer("BGD", "LIMITE_LOCALIDAD", 1_826),
      layer("BGD", "MANZANA", 100),
    ];

    const manifest = buildCartographyManifest({
      mgs: { name: "mgs.zip", sha256: "a".repeat(64), bytes: 10_000, layers: mgs },
      bgd: { name: "bgd.zip", sha256: "b".repeat(64), bytes: 20_000, layers: bgd },
    });

    assert.equal(manifest.schema_version, 1);
    assert.deepEqual(
      manifest.layers.filter((item) => item.politica === "CARGAR").map((item) => item.capa),
      [
        "ENTIDAD",
        "MUNICIPIO",
        "DISTRITO_LOCAL",
        "DISTRITO_FEDERAL",
        "SECCION",
        "COLONIA",
        "LOCALIDAD",
        "LIMITE_LOCALIDAD",
      ],
    );
    assert.equal(manifest.layers.find((item) => item.producto === "BGD" && item.capa === "SECCION").politica, "VERIFICAR_DUPLICADA");
    assert.equal(manifest.layers.some((item) => item.capa === "MANZANA"), false);
  });

  it("rejects a duplicated BGD core layer whose count differs from MGS", () => {
    const mgs = [
      layer("MGS", "ENTIDAD", 1),
      layer("MGS", "MUNICIPIO", 125),
      layer("MGS", "DISTRITO_LOCAL", 45),
      layer("MGS", "DISTRITO_FEDERAL", 40),
      layer("MGS", "SECCION", 7_052),
    ];
    const bgd = [
      layer("BGD", "ENTIDAD", 1, { extensions: ["shp", "shx", "dbf", "prj", "cpg"] }),
      layer("BGD", "MUNICIPIO", 125, { extensions: ["shp", "shx", "dbf", "prj", "cpg"] }),
      layer("BGD", "DISTRITO_LOCAL", 45, { extensions: ["shp", "shx", "dbf", "prj", "cpg"] }),
      layer("BGD", "DISTRITO_FEDERAL", 40, { extensions: ["shp", "shx", "dbf", "prj", "cpg"] }),
      layer("BGD", "SECCION", 7_051, { extensions: ["shp", "shx", "dbf", "prj", "cpg"] }),
      layer("BGD", "COLONIA", 7_367),
      layer("BGD", "LOCALIDAD", 3_639),
      layer("BGD", "LIMITE_LOCALIDAD", 1_826),
    ];

    assert.throws(
      () => buildCartographyManifest({
        mgs: { name: "mgs.zip", sha256: "a".repeat(64), bytes: 10_000, layers: mgs },
        bgd: { name: "bgd.zip", sha256: "b".repeat(64), bytes: 20_000, layers: bgd },
      }),
      /SECCION.*count/i,
    );
  });
});
