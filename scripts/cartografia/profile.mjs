const CORE_LAYERS = [
  "ENTIDAD",
  "MUNICIPIO",
  "DISTRITO_LOCAL",
  "DISTRITO_FEDERAL",
  "SECCION",
];
const BGD_LAYERS = [...CORE_LAYERS, "COLONIA", "LOCALIDAD", "LIMITE_LOCALIDAD"];
const GEOMETRY_TYPES = new Set([
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
]);

export function parseDbfHeader(payload) {
  const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload ?? []);
  if (bytes.length < 33) throw new Error("DBF header is truncated");
  const records = bytes.readUInt32LE(4);
  const headerLength = bytes.readUInt16LE(8);
  if (headerLength < 33 || headerLength > bytes.length) {
    throw new Error("DBF header length is invalid");
  }

  const fields = [];
  for (let offset = 32; offset + 31 < headerLength; offset += 32) {
    if (bytes[offset] === 0x0d) break;
    const end = bytes.indexOf(0, offset);
    const nameEnd = end >= offset && end < offset + 11 ? end : offset + 11;
    const name = bytes.subarray(offset, nameEnd).toString("ascii").trim();
    if (!name) throw new Error("DBF field name is empty");
    fields.push({
      name,
      type: String.fromCharCode(bytes[offset + 11]),
      length: bytes[offset + 16],
      decimals: bytes[offset + 17],
    });
  }
  return { records, fields };
}

function normalizeEncoding(value) {
  const normalized = value?.trim().toLowerCase().replaceAll("_", "-");
  if (normalized === "utf8" || normalized === "utf-8") return "utf-8";
  if (
    normalized === "windows-1252" ||
    normalized === "cp1252" ||
    normalized === "1252"
  ) return "windows-1252";
  return null;
}

export function resolveDbfEncoding({ layer, cpg, explicitEncoding }) {
  const declared = normalizeEncoding(cpg);
  if (cpg && !declared) throw new Error(`Unsupported CPG encoding for ${layer}: ${cpg}`);
  const configured = normalizeEncoding(explicitEncoding);
  if (explicitEncoding && !configured) {
    throw new Error(`Unsupported explicit encoding for ${layer}: ${explicitEncoding}`);
  }
  if (declared && configured && declared !== configured) {
    throw new Error(`Explicit encoding conflicts with CPG for ${layer}`);
  }
  const resolved = declared ?? configured;
  if (!resolved) throw new Error(`An explicit encoding is required for ${layer}`);
  return resolved;
}

function assertPackage(product, value) {
  if (!value || typeof value !== "object") throw new Error(`${product} package is required`);
  if (!value.name?.toLowerCase().endsWith(".zip")) throw new Error(`${product} package name must end in .zip`);
  if (!/^[0-9a-f]{64}$/.test(value.sha256 ?? "")) throw new Error(`${product} package SHA-256 is invalid`);
  if (!Number.isSafeInteger(value.bytes) || value.bytes <= 0) throw new Error(`${product} package byte count is invalid`);
  if (!Array.isArray(value.layers)) throw new Error(`${product} layer inventory is required`);
}

function validateLayer(product, layer) {
  if (!Number.isSafeInteger(layer.records) || layer.records < 0) {
    throw new Error(`${layer.name} record count is invalid`);
  }
  if (!GEOMETRY_TYPES.has(layer.geometryType)) {
    throw new Error(`${layer.name} geometry type is invalid`);
  }
  const required = product === "MGS"
    ? ["shp", "shx", "dbf", "prj", "cpg"]
    : ["shp", "shx", "dbf", "prj"];
  const actual = [...new Set(layer.components.map((item) => item.extension.toLowerCase()))].sort();
  for (const extension of required) {
    if (!actual.includes(extension)) throw new Error(`${product} ${layer.name} is missing .${extension}`);
  }
  if (actual.some((extension) => ![...required, "cpg"].includes(extension))) {
    throw new Error(`${product} ${layer.name} has an unsupported component`);
  }
}

function manifestLayer(layer, policy) {
  return {
    producto: layer.product,
    capa: layer.name,
    politica: policy,
    tipo_geometria: layer.geometryType,
    registros: layer.records,
    components: layer.components
      .map((component) => ({
        nombre: component.name,
        extension: component.extension.toLowerCase(),
        sha256: component.sha256,
        bytes: component.bytes,
        registros_declarados: component.declaredRecords,
      }))
      .sort((left, right) => left.extension.localeCompare(right.extension)),
  };
}

export function buildCartographyManifest({ mgs, bgd }) {
  assertPackage("MGS", mgs);
  assertPackage("BGD", bgd);

  const byProduct = {
    MGS: new Map(mgs.layers.map((item) => [item.name, item])),
    BGD: new Map(bgd.layers.map((item) => [item.name, item])),
  };
  for (const name of CORE_LAYERS) {
    const mgsLayer = byProduct.MGS.get(name);
    const bgdLayer = byProduct.BGD.get(name);
    if (!mgsLayer || !bgdLayer) throw new Error(`${name} is required in MGS and BGD`);
    validateLayer("MGS", mgsLayer);
    validateLayer("BGD", bgdLayer);
    if (mgsLayer.records !== bgdLayer.records) {
      throw new Error(`${name} record count differs between MGS and BGD`);
    }
  }
  for (const name of BGD_LAYERS.slice(CORE_LAYERS.length)) {
    const item = byProduct.BGD.get(name);
    if (!item) throw new Error(`${name} is required in BGD`);
    validateLayer("BGD", item);
  }

  const layers = [
    ...CORE_LAYERS.map((name) => manifestLayer(byProduct.MGS.get(name), "CARGAR")),
    ...CORE_LAYERS.map((name) => manifestLayer(byProduct.BGD.get(name), "VERIFICAR_DUPLICADA")),
    ...BGD_LAYERS.slice(CORE_LAYERS.length).map((name) => manifestLayer(byProduct.BGD.get(name), "CARGAR")),
  ];
  return {
    schema_version: 1,
    clave_entidad: "15",
    srid_origen: 32614,
    srid_destino: 4326,
    packages: {
      MGS: { nombre: mgs.name, sha256: mgs.sha256, bytes: mgs.bytes },
      BGD: { nombre: bgd.name, sha256: bgd.sha256, bytes: bgd.bytes },
    },
    layers,
  };
}
