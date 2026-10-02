import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CartografiaVersion } from "./cartografia-versionada";
import {
  buildSectionGeometryCandidates,
  buildVersionedSectionsUrl,
  clearSectionOverlay,
  isStaticTerritorialGeometryCompatible,
  isSectionSelectionCurrent,
  isSectionSelectionVisible,
  normalizeMunicipioClave,
  selectInitialCartografiaVersion,
} from "./cartografia-map";

function version(
  id: number,
  state: string,
  isDefault: boolean,
  validFrom: string
): CartografiaVersion {
  return {
    id,
    key: `VERSION_${id}`,
    name: `Cartografia ${id}`,
    state,
    cutoffDate: validFrom,
    publicationDate: validFrom,
    expectedPublicationDate: null,
    validFrom,
    validUntil: null,
    isDefault,
    counts: { SECCION: 7052 },
  };
}

describe("selectInitialCartografiaVersion", () => {
  it("selects the explicit default instead of relying on response order", () => {
    const versions = [
      version(5026, "PUBLICADA", false, "2026-11-12"),
      version(4025, "PUBLICADA", true, "2026-09-25"),
    ];

    assert.equal(selectInitialCartografiaVersion(versions)?.id, 4025);
  });

  it("falls back to the newest published version when no default exists", () => {
    const versions = [
      version(4025, "ARCHIVADA", false, "2026-09-25"),
      version(5026, "PUBLICADA", false, "2026-11-12"),
      version(3024, "VALIDADA", false, "2026-08-01"),
    ];

    assert.equal(selectInitialCartografiaVersion(versions)?.id, 5026);
    assert.equal(selectInitialCartografiaVersion([]), null);
  });
});

describe("normalizeMunicipioClave", () => {
  it("normalizes municipal numbers and Estado de Mexico CVEGEO values", () => {
    const cases: Array<[string | number | null, string | null]> = [
      [1, "001"],
      ["001", "001"],
      ["15001", "001"],
      ["125", "125"],
      [null, null],
      ["", null],
      ["ABC", null],
      ["16001", null],
      [126, null],
    ];

    for (const [input, expected] of cases) {
      assert.equal(normalizeMunicipioClave(input), expected);
    }
  });
});

describe("buildVersionedSectionsUrl", () => {
  it("pins every section request to a version, municipality and bounded bbox", () => {
    assert.equal(
      buildVersionedSectionsUrl({ versionId: 4025, municipio: "001" }),
      "/api/cartografia/secciones?versionId=4025&minLon=-100.75&minLat=18.3&maxLon=-98.5&maxLat=20.35&municipio=001&limit=5000"
    );
  });
});

describe("buildSectionGeometryCandidates", () => {
  it("tries versioned sections first and keeps ArcGIS only as an unversioned fallback", () => {
    assert.deepEqual(
      buildSectionGeometryCandidates({
        versionId: 4025,
        municipio: "001",
        allowUnversionedFallback: true,
      }),
      [
        {
          source: "VERSIONED",
          versionId: 4025,
          url: "/api/cartografia/secciones?versionId=4025&minLon=-100.75&minLat=18.3&maxLon=-98.5&maxLat=20.35&municipio=001&limit=5000",
        },
        {
          source: "ARCGIS_FALLBACK",
          versionId: null,
          url: "/api/arcgis/seccion?returnGeometry=true&where=CVE_MUN%3D1",
        },
      ],
    );
  });

  it("uses only the unversioned fallback after the version catalog fails", () => {
    assert.deepEqual(
      buildSectionGeometryCandidates({
        versionId: null,
        municipio: "125",
        allowUnversionedFallback: true,
      }),
      [
        {
          source: "ARCGIS_FALLBACK",
          versionId: null,
          url: "/api/arcgis/seccion?returnGeometry=true&where=CVE_MUN%3D125",
        },
      ],
    );
    assert.deepEqual(
      buildSectionGeometryCandidates({
        versionId: null,
        municipio: "125",
        allowUnversionedFallback: false,
      }),
      [],
    );
  });
});

describe("isStaticTerritorialGeometryCompatible", () => {
  it("allows thematic coloring only for the published default geometry version", () => {
    const versions = [
      version(4025, "ARCHIVADA", false, "2026-09-25"),
      version(5026, "PUBLICADA", true, "2026-11-12"),
    ];

    assert.equal(isStaticTerritorialGeometryCompatible(versions, 5026), true);
    assert.equal(isStaticTerritorialGeometryCompatible(versions, 4025), false);
    assert.equal(isStaticTerritorialGeometryCompatible(versions, null), false);
    assert.equal(
      isStaticTerritorialGeometryCompatible(
        [version(5026, "VALIDADA", true, "2026-11-12")],
        5026,
      ),
      false,
    );
  });
});

describe("clearSectionOverlay", () => {
  it("removes stale sections without touching other map layers", () => {
    const section = { type: "FeatureCollection", features: [] } as const;
    const district = { type: "FeatureCollection", features: [] } as const;

    assert.deepEqual(
      clearSectionOverlay({ seccion: section, distrito_local: district }),
      { distrito_local: district }
    );
  });
});

describe("isSectionSelectionCurrent", () => {
  it("hides a section popup after the cartography version changes", () => {
    assert.equal(isSectionSelectionCurrent(4025, 4025), true);
    assert.equal(isSectionSelectionCurrent(4025, 5026), false);
    assert.equal(isSectionSelectionCurrent(4025, null), false);
  });
});

describe("isSectionSelectionVisible", () => {
  it("keeps a section click visible only while its exact geometry remains active", () => {
    const fallbackGeometry = {};
    const replacementGeometry = {};

    assert.equal(
      isSectionSelectionVisible(null, null, fallbackGeometry, fallbackGeometry),
      true,
    );
    assert.equal(
      isSectionSelectionVisible(null, null, fallbackGeometry, null),
      false,
    );
    assert.equal(
      isSectionSelectionVisible(
        null,
        null,
        fallbackGeometry,
        replacementGeometry,
      ),
      false,
    );
    assert.equal(
      isSectionSelectionVisible(4025, 5026, fallbackGeometry, fallbackGeometry),
      false,
    );
  });
});
