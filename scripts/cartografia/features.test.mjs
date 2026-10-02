import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildFeatureBatches,
  normalizeCartographyFeature,
} from "./features.mjs";

const polygon = {
  type: "Polygon",
  coordinates: [[[500000, 2150000], [500100, 2150000], [500100, 2150100], [500000, 2150000]]],
};

describe("cartography feature normalization", () => {
  it("builds the exact SECCION identity and normalizes Polygon to MultiPolygon", () => {
    const normalized = normalizeCartographyFeature("SECCION", {
      type: "Feature",
      properties: {
        ENTIDAD: 15,
        MUNICIPIO: 6,
        DISTRITO_L: 18,
        DISTRITO_F: 25,
        SECCION: 42,
      },
      geometry: polygon,
    }, 1);

    assert.deepEqual(normalized.clave, {
      entidad: "15",
      municipio: "006",
      distrito_local: 18,
      distrito_federal: 25,
      seccion: 42,
    });
    assert.equal(normalized.geometry.type, "MultiPolygon");
    assert.equal(normalized.geometry.coordinates.length, 1);
    assert.ok(Math.abs(normalized.geometry.coordinates[0][0][0][0] + 99) < 1e-9);
    assert.ok(normalized.geometry.coordinates[0][0][0][1] > 18);
    assert.match(normalized.sha256, /^[0-9a-f]{64}$/);
    assert.equal(normalized.fila, 1);
  });

  it("uses INE source IDs and preserves required LOCALIDAD/LIMITE attributes", () => {
    const localidad = normalizeCartographyFeature("LOCALIDAD", {
      type: "Feature",
      properties: {
        id: "150060001",
        entidad: 15,
        municipio: 6,
        seccion: 42,
        localidad: 1,
        nombre: "San José",
      },
      geometry: { type: "Point", coordinates: [500000, 2150000] },
    }, 3);
    assert.deepEqual(localidad.clave, {
      entidad: "15",
      municipio: "006",
      seccion: 42,
      id_ine: "150060001",
    });
    assert.equal(localidad.atributos.nombre, "San José");
    assert.equal(localidad.atributos.LOCALIDAD, 1);

    const limite = normalizeCartographyFeature("LIMITE_LOCALIDAD", {
      type: "Feature",
      properties: {
        ID: "150060001-A",
        ENTIDAD: 15,
        MUNICIPIO: 6,
        LOCALIDAD: 1,
        NOMBRE: "San José",
        TIPO: 2,
        CABECERA: 1,
      },
      geometry: polygon,
    }, 4);
    assert.deepEqual(limite.clave, {
      entidad: "15",
      municipio: "006",
      id_fuente_limite: "150060001-A",
      clave_localidad_fuente: "1",
    });
    assert.equal(limite.atributos.TIPO, 2);
    assert.equal(limite.atributos.CABECERA, 1);
  });

  it("allows source-null geometry only for COLONIA", () => {
    const colonia = normalizeCartographyFeature("COLONIA", {
      type: "Feature",
      properties: { ID: "C-1", ENTIDAD: 15, MUNICIPIO: 6, NOMBRE: "Centro" },
      geometry: null,
    }, 5);
    assert.equal(colonia.geometry, null);

    assert.throws(
      () => normalizeCartographyFeature("MUNICIPIO", {
        type: "Feature",
        properties: { ENTIDAD: 15, MUNICIPIO: 6, NOMBRE: "Toluca" },
        geometry: null,
      }, 1),
      /geometry/i,
    );
    assert.throws(
      () => normalizeCartographyFeature("LOCALIDAD", {
        type: "Feature",
        properties: { ID: "1", ENTIDAD: 15, MUNICIPIO: 6, SECCION: 42, LOCALIDAD: 1, NOMBRE: "X" },
        geometry: polygon,
      }, 1),
      /type|Point/i,
    );
  });

  it("produces deterministic hashes regardless of source property order", () => {
    const left = normalizeCartographyFeature("MUNICIPIO", {
      type: "Feature",
      properties: { ENTIDAD: 15, MUNICIPIO: 6, NOMBRE: "Toluca" },
      geometry: polygon,
    }, 1);
    const right = normalizeCartographyFeature("MUNICIPIO", {
      type: "Feature",
      properties: { NOMBRE: "Toluca", MUNICIPIO: 6, ENTIDAD: 15 },
      geometry: polygon,
    }, 1);
    assert.equal(left.sha256, right.sha256);
  });

  it("derives stable district names when the INE source has no NOMBRE field", () => {
    const item = normalizeCartographyFeature("DISTRITO_LOCAL", {
      type: "Feature",
      properties: { ENTIDAD: 15, DISTRITO_L: 7 },
      geometry: polygon,
    }, 1);
    assert.equal(item.atributos.nombre, "DISTRITO LOCAL 7");
  });

  it("rejects geometries projected outside the Estado de México operating envelope", () => {
    assert.throws(() => normalizeCartographyFeature("LOCALIDAD", {
      type: "Feature",
      properties: {
        ID: "1", ENTIDAD: 15, MUNICIPIO: 6, SECCION: 42, LOCALIDAD: 1, NOMBRE: "X",
      },
      geometry: { type: "Point", coordinates: [500000, 0] },
    }, 1), /operating envelope/i);
  });
});

describe("cartography feature batching", () => {
  it("creates contiguous resumable batches bounded by rows and UTF-8 bytes", () => {
    const features = Array.from({ length: 503 }, (_, index) => ({
      fila: index + 1,
      clave: { entidad: "15", municipio: "006", id_ine: String(index + 1) },
      atributos: { nombre: `Colonia ${index + 1}` },
      geometry: null,
      sha256: "a".repeat(64),
    }));
    const batches = buildFeatureBatches("COLONIA", features, {
      maxRows: 200,
      maxBytes: 1_000_000,
    });

    assert.deepEqual(batches.map(({ desde, hasta }) => [desde, hasta]), [
      [1, 200],
      [201, 400],
      [401, 503],
    ]);
    for (const batch of batches) {
      assert.ok(batch.features.length <= 200);
      assert.ok(batch.bytes <= 1_000_000);
      assert.match(batch.checksum, /^[0-9a-f]{64}$/);
    }
  });

  it("rejects a single feature larger than the byte ceiling", () => {
    assert.throws(
      () => buildFeatureBatches("COLONIA", [{
        fila: 1,
        clave: { entidad: "15", municipio: "006", id_ine: "1" },
        atributos: { nombre: "X".repeat(1_000) },
        geometry: null,
        sha256: "a".repeat(64),
      }], { maxRows: 250, maxBytes: 100 }),
      /exceeds.*byte/i,
    );
  });
});
