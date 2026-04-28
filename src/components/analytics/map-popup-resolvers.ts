import type { MapAnalyticsDTO } from "@/actions/analytics";

type FeatureProperties = Record<string, string | number | null | undefined>;

function toNumericCandidates(value: string | number | null | undefined): number[] {
  if (value == null || value === "") return [];

  const raw = String(value).trim();
  if (!raw) return [];

  const numbers = new Set<number>();
  const parsed = Number(raw);
  if (Number.isFinite(parsed)) numbers.add(parsed);

  const digits = raw.replace(/\D/g, "");
  if (digits) {
    const parsedDigits = Number(digits);
    if (Number.isFinite(parsedDigits)) numbers.add(parsedDigits);
    if (digits.length >= 3) {
      const last3 = Number(digits.slice(-3));
      if (Number.isFinite(last3)) numbers.add(last3);
    }
  }

  return [...numbers].filter((n) => n > 0);
}

function firstAnalyticsMatch(
  props: FeatureProperties,
  analyticsByGeoId: Map<number, MapAnalyticsDTO>,
  analyticsByMunicipioId: Map<number, MapAnalyticsDTO>
) {
  const geoFields = ["CVE_MUN", "geo_municipio_id", "MUNICIPIO", "CVEGEO", "municipio"];
  for (const field of geoFields) {
    for (const candidate of toNumericCandidates(props[field])) {
      const match = analyticsByGeoId.get(candidate);
      if (match) return match;
    }
  }

  for (const candidate of toNumericCandidates(props.municipio_id)) {
    const match = analyticsByMunicipioId.get(candidate);
    if (match) return match;
  }

  return null;
}

export function resolvePopupContext(
  props: FeatureProperties,
  analyticsByGeoId: Map<number, MapAnalyticsDTO>,
  analyticsByMunicipioId: Map<number, MapAnalyticsDTO>,
  selectedMunicipioId: number | null = null
) {
  const analytics = firstAnalyticsMatch(props, analyticsByGeoId, analyticsByMunicipioId);
  const directMunicipioId = toNumericCandidates(props.municipio_id)[0] ?? null;

  return {
    analytics,
    municipioId:
      selectedMunicipioId ??
      analytics?.municipio_id ??
      directMunicipioId ??
      null,
  };
}
