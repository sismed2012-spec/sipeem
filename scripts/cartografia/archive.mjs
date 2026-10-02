import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { parseDbfHeader, resolveDbfEncoding } from "./profile.mjs";

const SHAPE_TYPES = new Map([
  [1, "Point"],
  [3, "MultiLineString"],
  [5, "MultiPolygon"],
  [8, "MultiPoint"],
  [11, "Point"],
  [13, "MultiLineString"],
  [15, "MultiPolygon"],
  [18, "MultiPoint"],
  [21, "Point"],
  [23, "MultiLineString"],
  [25, "MultiPolygon"],
  [28, "MultiPoint"],
]);

export const CORE_LAYERS = Object.freeze([
  "ENTIDAD",
  "MUNICIPIO",
  "DISTRITO_LOCAL",
  "DISTRITO_FEDERAL",
  "SECCION",
]);
export const CONTEXT_LAYERS = Object.freeze(["COLONIA", "LOCALIDAD", "LIMITE_LOCALIDAD"]);
export const LOAD_LAYERS = Object.freeze([...CORE_LAYERS, ...CONTEXT_LAYERS]);

function hashBuffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function hashFile(filePath) {
  return hashBuffer(await readFile(filePath));
}

export function assertSafeArchiveEntries(entries) {
  for (const original of entries) {
    const entry = original.trim().replaceAll("\\", "/");
    if (!entry) continue;
    const segments = entry.split("/");
    if (
      entry.startsWith("/") ||
      /^[A-Za-z]:\//.test(entry) ||
      segments.includes("..") ||
      entry.includes("\0")
    ) {
      throw new Error(`Unsafe archive entry: ${original}`);
    }
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited ${exitCode}: ${stderr}`));
    });
  });
}

async function listArchive(archivePath) {
  const result = await run("tar", ["-tf", archivePath]);
  const entries = result.stdout.split(/\r?\n/).filter(Boolean);
  assertSafeArchiveEntries(entries);
  return entries;
}

async function extractArchive(archivePath, destination) {
  await listArchive(archivePath);
  await mkdir(destination, { recursive: true });
  // Windows/Google Drive ZIP timestamps can be outside the host filesystem range.
  // `-m` keeps extraction deterministic without failing while restoring mtimes.
  await run("tar", ["-xmf", archivePath, "-C", destination]);
}

async function walkFiles(root) {
  const result = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const resolved = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(resolved);
      else if (entry.isFile()) result.push(resolved);
    }
  };
  await visit(root);
  return result;
}

function findNestedArchive(files, product) {
  const nestedExtension = product === "MGS" ? ".zip" : ".7z";
  const nested = files.filter((file) => path.extname(file).toLowerCase() === nestedExtension);
  if (nested.length !== 1) {
    throw new Error(`${product} package must contain exactly one nested ${nestedExtension} archive`);
  }
  return nested[0];
}

export async function stageNestedPackage(packagePath, product, scratchRoot, { expectedSha256 } = {}) {
  if (!/^[0-9a-f]{64}$/.test(expectedSha256 ?? "")) {
    throw new Error(`${product} expected outer package SHA-256 is required`);
  }
  const temporary = path.join(scratchRoot, product);
  const outerSnapshot = path.join(temporary, "outer-snapshot.zip");
  const outer = path.join(temporary, "outer");
  const outerVerification = path.join(temporary, "outer-verification");
  const inner = path.join(temporary, "inner");
  const innerVerification = path.join(temporary, "inner-verification");
  const packageBytes = await readFile(packagePath);
  if (hashBuffer(packageBytes) !== expectedSha256) {
    throw new Error(`${product} package changed after its initial fingerprint`);
  }
  await mkdir(temporary, { recursive: true });
  await writeFile(outerSnapshot, packageBytes);
  await Promise.all([
    extractArchive(outerSnapshot, outer),
    extractArchive(outerSnapshot, outerVerification),
  ]);
  if (await hashFile(outerSnapshot) !== expectedSha256) {
    throw new Error(`${product} staged package changed during extraction`);
  }
  const [nested, verificationNested] = await Promise.all([
    walkFiles(outer).then((files) => findNestedArchive(files, product)),
    walkFiles(outerVerification).then((files) => findNestedArchive(files, product)),
  ]);
  const relativeNested = path.relative(outer, nested);
  if (relativeNested !== path.relative(outerVerification, verificationNested)) {
    throw new Error(`${product} nested archive path differs between pinned extractions`);
  }
  const [nestedBytes, verificationBytes] = await Promise.all([
    readFile(nested), readFile(verificationNested),
  ]);
  if (hashBuffer(nestedBytes) !== hashBuffer(verificationBytes)) {
    throw new Error(`${product} nested archive differs between pinned extractions`);
  }
  const nestedExtension = product === "MGS" ? ".zip" : ".7z";
  const nestedSnapshot = path.join(temporary, `nested-snapshot${nestedExtension}`);
  await writeFile(nestedSnapshot, nestedBytes);
  await Promise.all([
    extractArchive(nestedSnapshot, inner),
    extractArchive(nestedSnapshot, innerVerification),
  ]);
  if (await hashFile(nestedSnapshot) !== hashBuffer(nestedBytes)) {
    throw new Error(`${product} nested snapshot changed during extraction`);
  }
  return { root: inner, verificationRoot: innerVerification };
}

export function inspectShpHeader(payload) {
  const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload ?? []);
  if (bytes.length < 100 || bytes.readInt32BE(0) !== 9994 || bytes.readInt32LE(28) !== 1000) {
    throw new Error("SHP header is invalid or truncated");
  }
  const sourceShapeType = bytes.readInt32LE(32);
  const geometryType = SHAPE_TYPES.get(sourceShapeType);
  if (!geometryType) throw new Error(`Unsupported SHP shape type: ${sourceShapeType}`);
  let records = 0;
  let offset = 100;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new Error("SHP record header is truncated");
    const contentBytes = bytes.readInt32BE(offset + 4) * 2;
    if (contentBytes < 4 || offset + 8 + contentBytes > bytes.length) {
      throw new Error("SHP record content is truncated");
    }
    records += 1;
    offset += 8 + contentBytes;
  }
  return { records, sourceShapeType, geometryType };
}

async function findLayerComponents(root, layer) {
  const expected = new Set(["shp", "shx", "dbf", "prj", "cpg"]);
  const matches = new Map();
  for (const file of await walkFiles(root)) {
    if (path.basename(file, path.extname(file)).toUpperCase() !== layer) continue;
    const extension = path.extname(file).slice(1).toLowerCase();
    if (!expected.has(extension)) continue;
    if (matches.has(extension)) throw new Error(`Duplicate ${layer}.${extension} component`);
    matches.set(extension, file);
  }
  return matches;
}

export async function inventoryLayer(root, product, layer, { explicitEncoding } = {}) {
  const files = await findLayerComponents(root, layer);
  for (const extension of ["shp", "shx", "dbf", "prj"]) {
    if (!files.has(extension)) throw new Error(`${product} ${layer} is missing .${extension}`);
  }
  const shpBytes = await readFile(files.get("shp"));
  const dbfBytes = await readFile(files.get("dbf"));
  const shp = inspectShpHeader(shpBytes);
  const dbf = parseDbfHeader(dbfBytes);
  if (shp.records !== dbf.records) {
    throw new Error(`${product} ${layer} SHP/DBF record counts differ`);
  }
  const cpg = files.has("cpg") ? (await readFile(files.get("cpg"), "utf8")).trim() : null;
  const encoding = resolveDbfEncoding({ layer, cpg, explicitEncoding });
  const components = [];
  for (const extension of ["shp", "shx", "dbf", "prj", "cpg"]) {
    const file = files.get(extension);
    if (!file) continue;
    const bytes = await readFile(file);
    components.push({
      name: path.basename(file),
      extension,
      path: file,
      bytes: bytes.length,
      sha256: hashBuffer(bytes),
      declaredRecords: extension === "shp" || extension === "dbf" ? dbf.records : null,
    });
  }
  return {
    product,
    name: layer,
    records: dbf.records,
    geometryType: shp.geometryType,
    encoding,
    encodingOrigin: files.has("cpg") ? "CPG" : "OVERRIDE_EXPLICITO",
    ldid: dbfBytes[29],
    components,
  };
}

export async function inventoryPackage(root, product) {
  const names = product === "MGS" ? CORE_LAYERS : LOAD_LAYERS;
  const layers = [];
  for (const name of names) {
    const explicitEncoding = product === "BGD" && CONTEXT_LAYERS.includes(name)
      ? "Windows-1252"
      : undefined;
    layers.push(await inventoryLayer(root, product, name, { explicitEncoding }));
  }
  return layers;
}

export async function packageDescriptor(packagePath, layers) {
  const details = await stat(packagePath);
  return {
    name: path.basename(packagePath),
    sha256: await hashFile(packagePath),
    bytes: details.size,
    layers,
  };
}
