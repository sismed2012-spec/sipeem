import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildEncodingEvidence,
  buildColonyEvidence,
  buildLimitsEvidence,
} from "./receipts.mjs";

function component(extension, sha = extension[0].repeat(64)) {
  return { extension, sha256: sha };
}

describe("cartography immutable receipts", () => {
  it("builds encoding evidence from the eight loaded layers", () => {
    const core = ["ENTIDAD", "MUNICIPIO", "DISTRITO_LOCAL", "DISTRITO_FEDERAL", "SECCION"];
    const context = ["COLONIA", "LOCALIDAD", "LIMITE_LOCALIDAD"];
    const evidence = buildEncodingEvidence({
      mgsSha256: "a".repeat(64),
      bgdSha256: "b".repeat(64),
      layers: [
        ...core.map((name) => ({ product: "MGS", name, encoding: "utf-8", encodingOrigin: "CPG", ldid: 0, components: [component("dbf"), component("cpg")] })),
        ...context.map((name) => ({ product: "BGD", name, encoding: "windows-1252", encodingOrigin: "OVERRIDE_EXPLICITO", ldid: 87, components: [component("dbf")] })),
      ],
    });
    assert.deepEqual(Object.keys(evidence.layers), [...core, ...context]);
    assert.equal(evidence.layers.COLONIA.cpg_sha256, null);
    assert.equal(evidence.layers.SECCION.origen, "CPG");
  });

  it("anchors every source-null colony to its row, ID and feature hash", () => {
    const evidence = buildColonyEvidence({
      bgdSha256: "b".repeat(64),
      features: [
        { fila: 1, clave: { id_ine: "C1" }, geometry: null, sha256: "1".repeat(64) },
        { fila: 2, clave: { id_ine: "C2" }, geometry: { type: "MultiPolygon" }, sha256: "2".repeat(64) },
      ],
    });
    assert.equal(evidence.registros_fuente, 2);
    assert.equal(evidence.con_geometria, 1);
    assert.equal(evidence.sin_geometria, 1);
    assert.deepEqual(evidence.filas_sin_geometria, [{
      fila_origen: 1,
      id_ine: "C1",
      fuente_sha256: "1".repeat(64),
    }]);
  });

  it("derives the complete point-to-limit graph without spatial guessing", () => {
    const localities = [
      { fila: 1, clave: { municipio: "006" }, atributos: { LOCALIDAD: 1 } },
      { fila: 2, clave: { municipio: "006" }, atributos: { LOCALIDAD: 1 } },
      { fila: 3, clave: { municipio: "006" }, atributos: { LOCALIDAD: 2 } },
    ];
    const limits = [
      { fila: 1, clave: { municipio: "006", id_fuente_limite: "L1", clave_localidad_fuente: "1" }, atributos: { TIPO: 4, CABECERA: 2 }, geometry: { type: "MultiPolygon" }, sha256: "1".repeat(64) },
      { fila: 2, clave: { municipio: "006", id_fuente_limite: "L2", clave_localidad_fuente: "9" }, atributos: { TIPO: 2, CABECERA: null }, geometry: { type: "MultiPolygon" }, sha256: "2".repeat(64) },
    ];
    const layer = (name) => ({ name, components: [component("dbf"), component("prj"), component("shp"), component("shx")] });
    const evidence = buildLimitsEvidence({
      bgdSha256: "b".repeat(64),
      localities,
      limits,
      layers: [layer("LOCALIDAD"), layer("LIMITE_LOCALIDAD")],
    });
    assert.deepEqual(evidence.conteos, {
      puntos: 3,
      claves_punto_distintas: 2,
      grupos_punto_repetidos: 1,
      limites: 2,
      claves_limite_distintas: 2,
      geometrias_validas: 2,
      limites_con_punto: 1,
      limites_sin_punto: 1,
      limites_un_punto: 0,
      limites_varios_puntos: 1,
      relaciones: 2,
    });
    assert.deepEqual(evidence.distribucion, {
      vinculados: [{ tipo: 4, cabecera: 2, conteo: 1 }],
      sin_punto: [{ tipo: 2, cabecera: null, conteo: 1 }],
    });
    assert.match(evidence.relaciones_sha256, /^[0-9a-f]{64}$/);
    assert.match(evidence.limites_sin_punto_sha256, /^[0-9a-f]{64}$/);
  });
});
