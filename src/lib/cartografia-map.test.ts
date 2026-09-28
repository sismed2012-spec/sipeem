import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CartografiaVersion } from "./cartografia-versionada";
import {
  buildVersionedSectionsUrl,
  clearSectionOverlay,
  isSectionSelectionCurrent,
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
