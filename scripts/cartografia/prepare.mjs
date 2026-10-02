import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import shapefile from "shapefile";

import {
  CONTEXT_LAYERS,
  CORE_LAYERS,
  hashFile,
  inventoryPackage,
  packageDescriptor,
  stageNestedPackage,
} from "./archive.mjs";
import {
  buildFeatureBatches,
  canonicalJson,
  normalizeCartographyFeature,
} from "./features.mjs";
import { buildCartographyManifest } from "./profile.mjs";
import {
  buildColonyEvidence,
  buildEncodingEvidence,
  buildLimitsEvidence,
} from "./receipts.mjs";
import {
  assertCartographyTransportBudget,
  buildCoverageSql,
  buildImportSql,
  buildPublishSql,
  buildStartSql,
  buildValidateSql,
} from "./sql-batches.mjs";

const CURRENT_LIMITS_CONTRACT = Object.freeze({
  bgdSha256: "fe9a1886a428a09fcd2514b3aff909a602384e36981f9ac1f510cac6f7c4c98d",
  relationsSha256: "0fbb44e5eeeb92b3140050221a4083e340a6e9e4c1cd403d6482f12e393ddc71",
  noPointSha256: "35a851408c6500c5b032fca38ed676cd741c6c275be2523c668d7b9c534bf42b",
  distributionSha256: "8e0f17d1f6a69668fe9e9554c93b31289d6d501748adfd421fdf9eb642e887e9",
  points: 3_639,
  limits: 1_826,
  relations: 1_384,
});

function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function writeTextAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, value, "utf8");
  await rename(temporary, filePath);
}

async function writeJson(filePath, value) {
  await writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function componentBytes(layer, extension) {
  const component = layer.components.find((item) => item.extension === extension);
  if (!component) throw new Error(`${layer.product} ${layer.name}.${extension} is missing`);
  return readFile(component.path).then((bytes) => {
    if (createHash("sha256").update(bytes).digest("hex") !== component.sha256) {
      throw new Error(`${layer.product} ${layer.name}.${extension} changed after inventory`);
    }
    return bytes;
  });
}

function inventorySeal(layers) {
  return canonicalJson(layers.map((layer) => ({
    product: layer.product,
    name: layer.name,
    records: layer.records,
    geometryType: layer.geometryType,
    encoding: layer.encoding,
    encodingOrigin: layer.encodingOrigin,
    ldid: layer.ldid,
    components: layer.components.map(({ name, extension, bytes, sha256, declaredRecords }) => ({
      name, extension, bytes, sha256, declaredRecords,
    })),
  })));
}

export async function parseLayerFeatures(layer) {
  const [shpBytes, dbfBytes] = await Promise.all([
    componentBytes(layer, "shp"),
    componentBytes(layer, "dbf"),
  ]);
  new TextDecoder(layer.encoding);
  const source = await shapefile.open(shpBytes, dbfBytes, { encoding: layer.encoding });
  const features = [];
  while (true) {
    const { value, done } = await source.read();
    if (done) break;
    if (!value || value.type !== "Feature") {
      throw new Error(`${layer.name} emitted an invalid GeoJSON feature`);
    }
    features.push(normalizeCartographyFeature(layer.name, value, features.length + 1));
  }
  if (features.length !== layer.records) {
    throw new Error(`${layer.name} parsed feature count differs from DBF/SHP headers`);
  }
  return features;
}

function duplicateFingerprint(feature) {
  return sha256Text(canonicalJson({ clave: feature.clave, geometry: feature.geometry }));
}

function compareDuplicateCore(mgsFeatures, bgdFeatures, layer) {
  if (mgsFeatures.length !== bgdFeatures.length) {
    throw new Error(`${layer} differs between MGS and BGD by feature count`);
  }
  for (let index = 0; index < mgsFeatures.length; index += 1) {
    if (duplicateFingerprint(mgsFeatures[index]) !== duplicateFingerprint(bgdFeatures[index])) {
      throw new Error(`${layer} differs between MGS and BGD at source row ${index + 1}`);
    }
  }
}

function currentLimitsCompatibility(bgdSha256, receipt) {
  const matches =
    bgdSha256 === CURRENT_LIMITS_CONTRACT.bgdSha256 &&
    receipt.relaciones_sha256 === CURRENT_LIMITS_CONTRACT.relationsSha256 &&
    receipt.limites_sin_punto_sha256 === CURRENT_LIMITS_CONTRACT.noPointSha256 &&
    sha256Text(canonicalJson(receipt.distribucion)) === CURRENT_LIMITS_CONTRACT.distributionSha256 &&
    receipt.conteos.puntos === CURRENT_LIMITS_CONTRACT.points &&
    receipt.conteos.limites === CURRENT_LIMITS_CONTRACT.limits &&
    receipt.conteos.relaciones === CURRENT_LIMITS_CONTRACT.relations;
  return {
    applyAllowedByCurrentSchema: matches,
    reason: matches
      ? "El recibo coincide con el contrato territorial instalado actualmente."
      : "El BGD no coincide con la aprobación cerrada instalada; se requiere una migración de compatibilidad revisada antes de aplicar esta nueva versión.",
  };
}

async function writeSqlStep(sqlRoot, fileName, sql, id) {
  assertCartographyTransportBudget(sql);
  const filePath = path.join(sqlRoot, fileName);
  await writeTextAtomic(filePath, sql);
  return { id, filePath, checksum: await hashFile(filePath) };
}

function artifactId(mgsSha256, bgdSha256) {
  return sha256Text(`${mgsSha256}:${bgdSha256}`);
}

export async function prepareCartographyArtifacts({
  mgsPath,
  bgdPath,
  versionKey,
  versionName,
  expectedPublicationDate,
  artifactBase = path.resolve(".artifacts", "cartografia"),
  onProgress = () => {},
}) {
  const [mgsSha256, bgdSha256] = await Promise.all([hashFile(mgsPath), hashFile(bgdPath)]);
  const root = path.join(artifactBase, artifactId(mgsSha256, bgdSha256));
  await mkdir(root, { recursive: true });
  const scratchRoot = path.join(root, "staging", randomUUID());
  onProgress("Extrayendo paquetes anidados de forma segura");
  try {
    const [mgsStage, bgdStage] = await Promise.all([
      stageNestedPackage(mgsPath, "MGS", scratchRoot, { expectedSha256: mgsSha256 }),
      stageNestedPackage(bgdPath, "BGD", scratchRoot, { expectedSha256: bgdSha256 }),
    ]);

    onProgress("Inventariando componentes, conteos, proyecciones y codificaciones");
  const [mgsLayers, bgdLayers, mgsVerification, bgdVerification] = await Promise.all([
    inventoryPackage(mgsStage.root, "MGS"),
    inventoryPackage(bgdStage.root, "BGD"),
    inventoryPackage(mgsStage.verificationRoot, "MGS"),
    inventoryPackage(bgdStage.verificationRoot, "BGD"),
  ]);
  if (inventorySeal(mgsLayers) !== inventorySeal(mgsVerification) ||
      inventorySeal(bgdLayers) !== inventorySeal(bgdVerification)) {
    throw new Error("Pinned cartography extraction differs from its independent verification");
  }
  const [mgs, bgd] = await Promise.all([
    packageDescriptor(mgsPath, mgsLayers),
    packageDescriptor(bgdPath, bgdLayers),
  ]);
  const manifest = buildCartographyManifest({ mgs, bgd });

  const featuresByLayer = new Map();
  const mgsByName = new Map(mgsLayers.map((layer) => [layer.name, layer]));
  const bgdByName = new Map(bgdLayers.map((layer) => [layer.name, layer]));
  for (const name of CORE_LAYERS) {
    onProgress(`Verificando duplicado MGS/BGD: ${name}`);
    const [mgsFeatures, bgdFeatures] = await Promise.all([
      parseLayerFeatures(mgsByName.get(name)),
      parseLayerFeatures(bgdByName.get(name)),
    ]);
    compareDuplicateCore(mgsFeatures, bgdFeatures, name);
    featuresByLayer.set(name, mgsFeatures);
  }
  for (const name of CONTEXT_LAYERS) {
    onProgress(`Normalizando capa BGD: ${name}`);
    featuresByLayer.set(name, await parseLayerFeatures(bgdByName.get(name)));
  }

  const loadedLayers = [...mgsLayers, ...bgdLayers.filter((layer) => CONTEXT_LAYERS.includes(layer.name))];
  const encodingEvidence = buildEncodingEvidence({
    mgsSha256,
    bgdSha256,
    layers: loadedLayers,
  });
  const colonyEvidence = buildColonyEvidence({
    bgdSha256,
    features: featuresByLayer.get("COLONIA"),
  });
  const limitsEvidence = buildLimitsEvidence({
    bgdSha256,
    localities: featuresByLayer.get("LOCALIDAD"),
    limits: featuresByLayer.get("LIMITE_LOCALIDAD"),
    layers: bgdLayers,
  });
  const databaseCompatibility = currentLimitsCompatibility(bgdSha256, limitsEvidence);

  await writeJson(path.join(root, "manifest.json"), manifest);
  await writeJson(path.join(root, "receipts", "encodings.json"), encodingEvidence);
  await writeJson(path.join(root, "receipts", "colonies.json"), colonyEvidence);
  await writeJson(path.join(root, "receipts", "locality-limits.json"), limitsEvidence);

  const sqlRoot = path.join(root, "sql");
  const plan = { import: [], validate: [], publish: [] };
  plan.import.push(await writeSqlStep(
    sqlRoot,
    "000-start.sql",
    buildStartSql({ versionKey, versionName, expectedPublicationDate, manifest }),
    "start",
  ));
  plan.import.push(await writeSqlStep(
    sqlRoot,
    "001-receipts.sql",
    buildCoverageSql({ versionKey, encodingEvidence, colonyEvidence, limitsEvidence }),
    "receipts",
  ));

  let sequence = 10;
  const layerSummaries = {};
  for (const name of [...CORE_LAYERS, ...CONTEXT_LAYERS]) {
    const features = featuresByLayer.get(name);
    const batches = buildFeatureBatches(name, features);
    layerSummaries[name] = { records: features.length, batches: batches.length };
    for (const batch of batches) {
      const prefix = String(sequence).padStart(4, "0");
      const fileName = `${prefix}-${name.toLowerCase()}-${batch.desde}-${batch.hasta}.sql`;
      plan.import.push(await writeSqlStep(
        sqlRoot,
        fileName,
        buildImportSql({ versionKey, batch }),
        `${name}:${batch.desde}-${batch.hasta}`,
      ));
      sequence += 1;
    }
  }
  // Validation is sealed later from an explicitly observed remote checkpoint.
  plan.publish.push(await writeSqlStep(
    sqlRoot,
    "901-publish.sql",
    buildPublishSql({ versionKey }),
    "publish",
  ));

  const preflight = {
    schema_version: 1,
    artifact_id: path.basename(root),
    version: {
      clave: versionKey,
      nombre: versionName,
      fecha_publicacion_esperada: expectedPublicationDate,
    },
    packages: manifest.packages,
    layers: layerSummaries,
    duplicate_core_verified: true,
    database_compatibility: databaseCompatibility,
    execution: {
      default_mode: "preflight",
      dev_project_ref: "nppvprbfmjbhwheghipa",
      automatic_retries: false,
      import_steps: plan.import.length,
    },
  };
    await writeJson(path.join(root, "plan.json"), plan);
    await writeJson(path.join(root, "preflight.json"), preflight);
    return { root, manifest, plan, preflight };
  } finally {
    await rm(scratchRoot, { recursive: true, force: true });
  }
}

export async function prepareValidationStep({ artifactRoot, versionKey, checkpoint }) {
  const sql = buildValidateSql({ versionKey, checkpoint });
  assertCartographyTransportBudget(sql);
  const checksum = sha256Text(sql);
  const filePath = path.join(artifactRoot, "sql", `validation-${checksum}.sql`);
  await mkdir(path.dirname(filePath), { recursive: true });
  try {
    await writeFile(filePath, sql, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    if (await hashFile(filePath) !== checksum) {
      throw new Error("Existing validation SQL differs from its sealed checkpoint");
    }
  }
  return { id: `validate-${checksum}`, filePath, checksum, checkpoint };
}
