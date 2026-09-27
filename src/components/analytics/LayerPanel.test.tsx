import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { LayerPanel } from "./LayerPanel";

describe("LayerPanel", () => {
  it("disables the section layer when versioned cartography is unavailable", () => {
    const html = renderToStaticMarkup(
      <LayerPanel
        activeOverlays={new Set()}
        onToggle={() => undefined}
        hasMunicipioSelected
        sectionAvailable={false}
      />
    );

    assert.match(html, /title="Cartografía versionada no disponible"/);
    assert.match(html, /disabled=""/);
  });
});

