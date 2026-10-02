type SectionProperties = Record<string, unknown>;

function positiveSafeInteger(value: unknown): number | null {
  if (value == null || value === "") return null;

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function resolveDemografiaSectionId(
  properties: SectionProperties
): number | null {
  return (
    positiveSafeInteger(properties.seccion_id) ??
    positiveSafeInteger(properties.SECCION_ID)
  );
}
