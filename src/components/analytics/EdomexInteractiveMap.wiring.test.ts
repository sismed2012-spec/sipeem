import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("EdomexInteractiveMap territorial theme wiring", () => {
  it("keeps political fill as fallback and applies municipal or district presentation", async () => {
    const source = await readFile(
      new URL("./EdomexInteractiveMap.tsx", import.meta.url),
      "utf8",
    );
    assert.match(source, /data\.partido_color \?\? "#f1f5f9"/);
    assert.match(source, /territorialTheme\.level === "MUNICIPIO"/);
    assert.match(source, /resolveTerritoryIndicator\(/);
    assert.match(source, /getIndicatorFill\(/);
    assert.match(source, /"#e2e8f0"/);
    assert.match(source, /formatTerritorialMetric\(/);
    assert.match(source, /Sin dato/);
  });

  it("orders overlays, preserves section clicks and isolates valid district clicks", async () => {
    const source = await readFile(
      new URL("./EdomexInteractiveMap.tsx", import.meta.url),
      "utf8",
    );
    assert.match(source, /const orderedOverlayEntries = useMemo/);
    assert.match(source, /overlayKey === "seccion" \? 2/);
    assert.match(source, /orderedOverlayEntries\.map/);
    assert.match(source, /if \(isDraggingRef\.current\) return/);
    assert.match(source, /event\.stopPropagation\(\)/);
    assert.match(source, /setSelectedTerritory\(\{/);
    assert.match(source, /row: territoryRow/);
    assert.match(
      source,
      /selectedTerritory\.versionId === territorialTheme\.versionId/,
    );
    assert.match(source, /className="cursor-pointer hover:brightness-90"/);
    assert.match(source, /"pointer-events-none"/);
    assert.match(source, /<TerritorialIndicatorPopup/);
  });

  it("adds a municipal summary only when a current thematic row exists", async () => {
    const source = await readFile(
      new URL("./MunicipioPopup.tsx", import.meta.url),
      "utf8",
    );
    assert.match(source, /territorialIndicator\?/);
    assert.match(source, /<TerritorialIndicatorSummary/);
  });
});
