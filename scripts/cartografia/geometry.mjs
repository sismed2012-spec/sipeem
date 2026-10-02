import proj4 from "proj4";

const SOURCE = "EPSG:32614";
const DESTINATION = "EPSG:4326";

function checkPosition(position) {
  if (!Array.isArray(position) || position.length !== 2 ||
      !position.every((value) => typeof value === "number" && Number.isFinite(value))) {
    throw new TypeError("Source coordinates must be finite two-dimensional positions");
  }
  return position;
}

function transformPosition(position) {
  const transformed = proj4(SOURCE, DESTINATION, checkPosition(position));
  if (!Array.isArray(transformed) || transformed.length !== 2 ||
      !transformed.every(Number.isFinite) || transformed[0] < -180 || transformed[0] > 180 ||
      transformed[1] < -90 || transformed[1] > 90) {
    throw new TypeError("Transformed coordinate is invalid");
  }
  return transformed;
}

function transformRing(ring) {
  if (!Array.isArray(ring) || ring.length < 4) throw new TypeError("Polygon ring is incomplete");
  const transformed = ring.map(transformPosition);
  if (transformed[0][0] !== transformed.at(-1)[0] ||
      transformed[0][1] !== transformed.at(-1)[1]) {
    throw new TypeError("Polygon ring is not closed");
  }
  return transformed;
}

function transformPolygon(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 1) throw new TypeError("Polygon has no rings");
  return polygon.map(transformRing);
}

export function normalizeGeometry(geometry) {
  if (!geometry || typeof geometry !== "object" || Array.isArray(geometry) ||
      Object.keys(geometry).some((key) => !["type", "coordinates"].includes(key))) {
    throw new TypeError("Source geometry is not valid GeoJSON");
  }
  switch (geometry.type) {
    case "Point":
      return { type: "Point", coordinates: transformPosition(geometry.coordinates) };
    case "Polygon":
      return { type: "MultiPolygon", coordinates: [transformPolygon(geometry.coordinates)] };
    case "MultiPolygon":
      if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length < 1) {
        throw new TypeError("MultiPolygon has no parts");
      }
      return { type: "MultiPolygon", coordinates: geometry.coordinates.map(transformPolygon) };
    default:
      throw new TypeError("Unsupported source geometry type");
  }
}

export function geometryBbox(geometry) {
  if (!geometry || !["Point", "MultiPolygon"].includes(geometry.type)) {
    throw new TypeError("Normalized geometry type is unsupported");
  }
  const positions = geometry.type === "Point" ? [geometry.coordinates] : geometry.coordinates.flat(2);
  if (positions.length < 1) throw new TypeError("Geometry has no vertices");
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const position of positions) {
    const [longitude, latitude] = checkPosition(position);
    bbox[0] = Math.min(bbox[0], longitude);
    bbox[1] = Math.min(bbox[1], latitude);
    bbox[2] = Math.max(bbox[2], longitude);
    bbox[3] = Math.max(bbox[3], latitude);
  }
  return bbox;
}
