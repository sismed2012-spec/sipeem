import { createHash } from "node:crypto";

const LOAD_ORDER = [
  "ENTIDAD",
  "MUNICIPIO",
  "DISTRITO_LOCAL",
  "DISTRITO_FEDERAL",
  "SECCION",
  "COLONIA",
  "LOCALIDAD",
  "LIMITE_LOCALIDAD",
];

function getComponent(layer, extension) {
  const component = layer.components.find((item) => item.extension === extension);
  if (!component) throw new Error(`${layer.name}.${extension} is required for receipt evidence`);
  return component;
}

export function buildEncodingEvidence({ mgsSha256, bgdSha256, layers }) {
  const byKey = new Map(layers.map((layer) => [`${layer.product}:${layer.name}`, layer]));
  const result = {};
  for (const name of LOAD_ORDER) {
    const product = LOAD_ORDER.indexOf(name) < 5 ? "MGS" : "BGD";
    const layer = byKey.get(`${product}:${name}`);
    if (!layer) throw new Error(`${product} ${name} is required for encoding evidence`);
    const cpg = layer.components.find((item) => item.extension === "cpg");
    result[name] = {
      encoding: layer.encoding,
      origen: layer.encodingOrigin,
      ldid: layer.ldid,
      dbf_sha256: getComponent(layer, "dbf").sha256,
      cpg_sha256: cpg?.sha256 ?? null,
    };
  }
  return {
    schema_version: 1,
    mgs_sha256: mgsSha256,
    bgd_sha256: bgdSha256,
    layers: result,
  };
}

export function buildColonyEvidence({ bgdSha256, features }) {
  const missing = features
    .filter((feature) => feature.geometry === null)
    .map((feature) => ({
      fila_origen: feature.fila,
      id_ine: feature.clave.id_ine,
      fuente_sha256: feature.sha256,
    }));
  return {
    schema_version: 1,
    bgd_sha256: bgdSha256,
    registros_fuente: features.length,
    con_geometria: features.length - missing.length,
    sin_geometria: missing.length,
    filas_sin_geometria: missing,
  };
}

function relationKey(item) {
  return `${item.clave.municipio}\u001f${item.atributos.LOCALIDAD ?? item.clave.clave_localidad_fuente}`;
}

function pgJsonbArrayText(value) {
  if (Array.isArray(value)) return `[${value.map(pgJsonbArrayText).join(", ")}]`;
  if (value === null || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function pgJsonbArrayHash(value) {
  return createHash("sha256").update(pgJsonbArrayText(value), "utf8").digest("hex");
}

function distribution(items) {
  const counts = new Map();
  for (const feature of items) {
    const tipo = Number(feature.atributos.TIPO);
    const raw = feature.atributos.CABECERA;
    const numeric = Number(raw);
    const cabecera = raw === "" || raw == null || !Number.isFinite(numeric) ? null : numeric;
    const key = `${tipo}\u001f${cabecera ?? "NULL"}`;
    counts.set(key, { tipo, cabecera, conteo: (counts.get(key)?.conteo ?? 0) + 1 });
  }
  return [...counts.values()].sort((left, right) => {
    if (left.tipo !== right.tipo) return left.tipo - right.tipo;
    if (left.cabecera === right.cabecera) return 0;
    if (left.cabecera == null) return 1;
    if (right.cabecera == null) return -1;
    return left.cabecera - right.cabecera;
  });
}

export function buildLimitsEvidence({ bgdSha256, localities, limits, layers }) {
  const pointsByKey = new Map();
  for (const point of localities) {
    const key = relationKey(point);
    const items = pointsByKey.get(key) ?? [];
    items.push(point);
    pointsByKey.set(key, items);
  }
  const linked = [];
  const unlinked = [];
  const relations = [];
  const noPointRows = [];
  let onePoint = 0;
  let multiplePoints = 0;
  for (const limit of limits) {
    const points = pointsByKey.get(relationKey(limit)) ?? [];
    if (points.length === 0) {
      unlinked.push(limit);
      noPointRows.push([
        limit.fila,
        limit.clave.id_fuente_limite,
        limit.clave.municipio,
        limit.clave.clave_localidad_fuente,
        limit.sha256,
      ]);
      continue;
    }
    linked.push(limit);
    if (points.length === 1) onePoint += 1;
    else multiplePoints += 1;
    for (const point of points) {
      relations.push([
        limit.fila,
        point.fila,
        limit.clave.municipio,
        limit.clave.clave_localidad_fuente,
      ]);
    }
  }
  relations.sort((left, right) =>
    left[0] - right[0] || left[1] - right[1] || String(left[2]).localeCompare(String(right[2])) || String(left[3]).localeCompare(String(right[3])));
  noPointRows.sort((left, right) =>
    left[0] - right[0] || String(left[1]).localeCompare(String(right[1])) || String(left[2]).localeCompare(String(right[2])) || String(left[3]).localeCompare(String(right[3])) || String(left[4]).localeCompare(String(right[4])));

  const uniquePointKeys = pointsByKey.size;
  const duplicatePointGroups = [...pointsByKey.values()].filter((items) => items.length > 1).length;
  const uniqueLimitKeys = new Set(limits.map((item) => item.clave.id_fuente_limite)).size;
  const validGeometries = limits.filter((item) => item.geometry?.type === "MultiPolygon").length;
  const byName = new Map(layers.map((layer) => [layer.name, layer]));
  const components = {};
  for (const name of ["LOCALIDAD", "LIMITE_LOCALIDAD"]) {
    const layer = byName.get(name);
    if (!layer) throw new Error(`${name} is required for limit receipt evidence`);
    components[name] = Object.fromEntries(
      ["dbf", "prj", "shp", "shx"].map((extension) => [extension, getComponent(layer, extension).sha256]),
    );
  }
  return {
    schema_version: 1,
    bgd_sha256: bgdSha256,
    componentes: components,
    conteos: {
      puntos: localities.length,
      claves_punto_distintas: uniquePointKeys,
      grupos_punto_repetidos: duplicatePointGroups,
      limites: limits.length,
      claves_limite_distintas: uniqueLimitKeys,
      geometrias_validas: validGeometries,
      limites_con_punto: linked.length,
      limites_sin_punto: unlinked.length,
      limites_un_punto: onePoint,
      limites_varios_puntos: multiplePoints,
      relaciones: relations.length,
    },
    relaciones_sha256: pgJsonbArrayHash(relations),
    limites_sin_punto_sha256: pgJsonbArrayHash(noPointRows),
    distribucion: {
      vinculados: distribution(linked),
      sin_punto: distribution(unlinked),
    },
  };
}
