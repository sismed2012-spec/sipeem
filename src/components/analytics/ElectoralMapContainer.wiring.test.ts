import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("ElectoralMapContainer cartography wiring", () => {
  it("loads a versioned section layer and forwards its version to the section popup", async () => {
    const source = await readFile(
      new URL("./ElectoralMapContainer.tsx", import.meta.url),
      "utf8"
    );

    assert.match(source, /fetch\("\/api\/cartografia\/versiones"/);
    assert.match(source, /buildVersionedSectionsUrl\(/);
    assert.match(
      source,
      /cartografiaVersionId=\{selectedCartografiaVersionId\}/
    );
  });

  it("coordinates a reversible territorial theme without replacing political data", async () => {
    const source = await readFile(
      new URL("./ElectoralMapContainer.tsx", import.meta.url),
      "utf8"
    );

    assert.match(source, /useState<TerritorialMapMode>\("POLITICAL"\)/);
    assert.match(source, /createTerritorialIndicatorsRequestCoordinator\(/);
    assert.match(
      source,
      /if \(territorialMode !== "INDICATOR" \|\| selectedCartografiaVersionId == null\)/
    );
    assert.match(source, /territorialCoordinatorRef\.current\?\.clear\(\)/);
    assert.match(source, /setTerritorialResponse\(null\)/);
    assert.match(source, /territorialLevel === "DISTRITO_LOCAL"/);
    assert.match(source, /ensureOverlay\("distrito_local"\)/);
    assert.match(source, /territorialLevel === "DISTRITO_FEDERAL"/);
    assert.match(source, /ensureOverlay\("distrito_federal"\)/);
    assert.match(source, /setThematicError\(/);
    assert.match(source, /const thematicPresentation = useMemo/);
    assert.match(source, /thematicError \|\| !territorialResponse/);
    assert.match(source, /setTerritorialRetryKey\(\(current\) => current \+ 1\)/);
    assert.match(
      source,
      /setTerritorialSelectionEpoch\(\(current\) => current \+ 1\)/,
    );
    assert.match(source, /selectionEpoch: territorialSelectionEpoch/);
    assert.match(source, /thematicPresentation \? \(/);
    assert.match(source, /<TerritorialIndicatorLegend/);
    assert.match(source, /: \([\s\S]*?<MapLegend/);
    assert.match(
      source,
      /const hasVisibleLegend = isAnalytic \|\| thematicPresentation !== null/,
    );
    assert.match(source, /\{hasVisibleLegend && \(/);
    assert.equal((source.match(/indicatorControls=\{indicatorControls\}/g) ?? []).length, 2);
    assert.match(source, /territorialTheme=\{thematicPresentation\}/);
    assert.match(source, /coberturaMap=\{coberturaMap\}/);
  });
});
