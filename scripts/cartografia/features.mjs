import { createHash } from "node:crypto";
import { geometryBbox, normalizeGeometry as projectGeometry } from "./geometry.mjs";

const LAYERS = new Set([
  "ENTIDAD",
  "MUNICIPIO",
  "DISTRITO_LOCAL",
  "DISTRITO_FEDERAL",
  "SECCION",
  "COLONIA",
  "LOCALIDAD",
  "LIMITE_LOCALIDAD",
]);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sourceLookup(properties) {
  const byName = new Map();
  for (const [key, value] of Object.entries(properties ?? {})) {
    byName.set(key.toUpperCase(), value);
  }
  return (name, { required = true } = {}) => {
    const value = byName.get(name.toUpperCase());
    if (required && (value === undefined || value === null || String(value).trim() === "")) {
      throw new Error(`Required source property ${name} is missing`);
    }
    return value;
  };
}

function text(value) {
  return String(value).trim();
}

function padded(value, length) {
  const normalized = text(value);
  if (!/^\d+$/.test(normalized)) throw new Error(`Expected a numeric code, received ${normalized}`);
  return normalized.padStart(length, "0");
}

function positiveInteger(value, label) {
  const normalized = text(value);
  if (!/^\d+$/.test(normalized)) throw new Error(`${label} must be numeric`);
  const number = Number(normalized);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${label} must be positive`);
  return number;
}

function buildIdentity(layer, get) {
  const entidad = padded(get("ENTIDAD"), 2);
  switch (layer) {
    case "ENTIDAD":
      return { entidad };
    case "MUNICIPIO":
      return { entidad, municipio: padded(get("MUNICIPIO"), 3) };
    case "DISTRITO_LOCAL":
      return { entidad, distrito_local: positiveInteger(get("DISTRITO_L"), "DISTRITO_L") };
    case "DISTRITO_FEDERAL":
      return { entidad, distrito_federal: positiveInteger(get("DISTRITO_F"), "DISTRITO_F") };
    case "SECCION":
      return {
        entidad,
        municipio: padded(get("MUNICIPIO"), 3),
        distrito_local: positiveInteger(get("DISTRITO_L"), "DISTRITO_L"),
        distrito_federal: positiveInteger(get("DISTRITO_F"), "DISTRITO_F"),
        seccion: positiveInteger(get("SECCION"), "SECCION"),
      };
    case "COLONIA":
      return {
        entidad,
        municipio: padded(get("MUNICIPIO"), 3),
        id_ine: text(get("ID")),
      };
    case "LOCALIDAD":
      return {
        entidad,
        municipio: padded(get("MUNICIPIO"), 3),
        seccion: positiveInteger(get("SECCION"), "SECCION"),
        id_ine: text(get("ID")),
      };
    case "LIMITE_LOCALIDAD":
      return {
        entidad,
        municipio: padded(get("MUNICIPIO"), 3),
        id_fuente_limite: text(get("ID")),
        clave_localidad_fuente: text(get("LOCALIDAD")),
      };
    default:
      throw new Error(`Unsupported cartography layer: ${layer}`);
  }
}

function normalizeGeometry(layer, geometry) {
  if (geometry === null) {
    if (layer === "COLONIA") return null;
    throw new Error(`${layer} requires a geometry`);
  }
  if (!geometry || typeof geometry !== "object") throw new Error(`${layer} geometry is invalid`);
  const normalized = projectGeometry(geometry);
  if (layer === "LOCALIDAD" ? normalized.type !== "Point" : normalized.type !== "MultiPolygon") {
    throw new Error(`${layer} geometry type is incompatible`);
  }
  const [minLongitude, minLatitude, maxLongitude, maxLatitude] = geometryBbox(normalized);
  if (minLongitude < -101 || maxLongitude > -98 || minLatitude < 18 || maxLatitude > 21) {
    throw new Error(`${layer} geometry is outside the Estado de México operating envelope`);
  }
  return normalized;
}

function normalizeAttributes(layer, properties, get) {
  const normalized = Object.fromEntries(
    Object.entries(properties ?? {}).sort(([left], [right]) => left.localeCompare(right)),
  );
  if (layer === "DISTRITO_LOCAL") {
    const sourceName = get("NOMBRE", { required: false });
    normalized.nombre = sourceName == null
      ? `DISTRITO LOCAL ${text(get("DISTRITO_L"))}`
      : text(sourceName);
  } else if (layer === "DISTRITO_FEDERAL") {
    const sourceName = get("NOMBRE", { required: false });
    normalized.nombre = sourceName == null
      ? `DISTRITO FEDERAL ${text(get("DISTRITO_F"))}`
      : text(sourceName);
  } else if (layer !== "SECCION" && layer !== "LIMITE_LOCALIDAD") {
    normalized.nombre = text(get("NOMBRE"));
  } else if (layer === "LIMITE_LOCALIDAD") {
    const sourceName = get("NOMBRE", { required: false });
    normalized.nombre = sourceName == null || text(sourceName) === ""
      ? `LIMITE LOCALIDAD ${text(get("ID"))}`
      : text(sourceName);
  }
  if (layer === "LOCALIDAD") normalized.LOCALIDAD = get("LOCALIDAD");
  if (layer === "LIMITE_LOCALIDAD") {
    normalized.TIPO = get("TIPO");
    const cabecera = get("CABECERA", { required: false });
    normalized.CABECERA = cabecera ?? null;
  }
  return normalized;
}

export function normalizeCartographyFeature(
  layer,
  sourceFeature,
  row,
) {
  if (!LAYERS.has(layer)) throw new Error(`Unsupported cartography layer: ${layer}`);
  if (!Number.isSafeInteger(row) || row <= 0) throw new Error("Feature row must be a positive integer");
  if (!sourceFeature || sourceFeature.type !== "Feature") throw new Error("GeoJSON Feature is required");
  const get = sourceLookup(sourceFeature.properties);
  const result = {
    fila: row,
    clave: buildIdentity(layer, get),
    atributos: normalizeAttributes(layer, sourceFeature.properties, get),
    geometry: normalizeGeometry(layer, sourceFeature.geometry),
  };
  const sourceFingerprint = {
    properties: sourceFeature.properties,
    geometry: sourceFeature.geometry,
  };
  return { ...result, sha256: sha256(canonicalJson(sourceFingerprint)) };
}

export function buildFeatureBatches(layer, features, options = {}) {
  if (!LAYERS.has(layer)) throw new Error(`Unsupported cartography layer: ${layer}`);
  const maxRows = options.maxRows ?? 250;
  // Leave room for Base64 expansion, SQL and the Management API JSON envelope.
  const maxBytes = options.maxBytes ?? 600_000;
  if (!Number.isSafeInteger(maxRows) || maxRows <= 0 || maxRows > 250) {
    throw new Error("maxRows must be between 1 and 250");
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > 5_000_000) {
    throw new Error("maxBytes must be between 1 and 5000000");
  }

  const batches = [];
  let current = [];
  const flush = () => {
    if (current.length === 0) return;
    const json = canonicalJson(current);
    batches.push({
      capa: layer,
      desde: current[0].fila,
      hasta: current.at(-1).fila,
      features: current,
      bytes: Buffer.byteLength(json, "utf8"),
      checksum: sha256(json),
    });
    current = [];
  };

  let previousRow = 0;
  for (const feature of features) {
    if (!Number.isSafeInteger(feature?.fila) || feature.fila !== previousRow + 1) {
      throw new Error("Feature rows must be contiguous and one-based");
    }
    previousRow = feature.fila;
    const singleBytes = Buffer.byteLength(canonicalJson([feature]), "utf8");
    if (singleBytes > maxBytes) throw new Error(`Feature row ${feature.fila} exceeds the byte ceiling`);
    const candidate = [...current, feature];
    const candidateBytes = Buffer.byteLength(canonicalJson(candidate), "utf8");
    if (current.length >= maxRows || candidateBytes > maxBytes) flush();
    current.push(feature);
  }
  flush();
  return batches;
}
