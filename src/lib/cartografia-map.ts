import {
  listCartografiaVersions,
  type CartografiaRpcInvoker,
  type CartografiaVersion,
} from "./cartografia-versionada";

const EDOMEX_BBOX = {
  minLon: -100.75,
  minLat: 18.3,
  maxLon: -98.5,
  maxLat: 20.35,
} as const;

function versionTimestamp(version: CartografiaVersion): number {
  const raw =
    version.validFrom ?? version.publicationDate ?? version.cutoffDate ?? "";
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function selectInitialCartografiaVersion(
  versions: CartografiaVersion[]
): CartografiaVersion | null {
  const explicitDefault = versions.find((version) => version.isDefault);
  if (explicitDefault) return explicitDefault;

  const candidates = versions.filter(
    (version) => version.state.toUpperCase() === "PUBLICADA"
  );
  const fallbackPool = candidates.length > 0 ? candidates : versions;

  return (
    [...fallbackPool].sort(
      (left, right) =>
        versionTimestamp(right) - versionTimestamp(left) || right.id - left.id
    )[0] ?? null
  );
}

export function normalizeMunicipioClave(
  value: string | number | null | undefined
): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) return null;

  let municipalDigits = raw;
  if (raw.length === 5) {
    if (!raw.startsWith("15")) return null;
    municipalDigits = raw.slice(-3);
  } else if (raw.length > 3) {
    return null;
  }

  const number = Number(municipalDigits);
  if (!Number.isSafeInteger(number) || number < 1 || number > 125) return null;
  return String(number).padStart(3, "0");
}

export function buildVersionedSectionsUrl(input: {
  versionId: number;
  municipio: string;
}): string {
  const params = new URLSearchParams({
    versionId: String(input.versionId),
    minLon: String(EDOMEX_BBOX.minLon),
    minLat: String(EDOMEX_BBOX.minLat),
    maxLon: String(EDOMEX_BBOX.maxLon),
    maxLat: String(EDOMEX_BBOX.maxLat),
    municipio: input.municipio,
    limit: "5000",
  });

  return `/api/cartografia/secciones?${params.toString()}`;
}

export function buildSectionOverlayUrl(input: {
  versionId: number | null;
  municipio: string | number | null;
}): string | null {
  const municipio = normalizeMunicipioClave(input.municipio);
  if (!municipio) return null;

  const versionId = input.versionId;
  if (versionId !== null && Number.isSafeInteger(versionId) && versionId > 0) {
    return buildVersionedSectionsUrl({
      versionId,
      municipio,
    });
  }

  return `/api/arcgis/seccion?returnGeometry=true&where=MUNICIPIO=${Number(municipio)}`;
}

export async function loadInitialCartografiaVersionId(
  invoke: CartografiaRpcInvoker
): Promise<number | null> {
  const versions = await listCartografiaVersions(invoke);
  return selectInitialCartografiaVersion(versions)?.id ?? null;
}

export function clearSectionOverlay<T extends Record<string, unknown>>(
  overlays: T
): Omit<T, "seccion"> {
  const remaining = { ...overlays };
  delete remaining.seccion;
  return remaining;
}

export function isSectionSelectionCurrent(
  selectionVersionId: number | null,
  currentVersionId: number | null
): boolean {
  return (
    selectionVersionId != null && selectionVersionId === currentVersionId
  );
}
