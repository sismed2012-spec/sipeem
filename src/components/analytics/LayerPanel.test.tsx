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

  it("keeps the commitment legend and mounts thematic controls separately", () => {
    const html = renderToStaticMarkup(
      <LayerPanel
        activeOverlays={new Set(["seccion"])}
        onToggle={() => undefined}
        hasMunicipioSelected
        indicatorControls={<div>Controles de indicador</div>}
      />
    );

    assert.match(html, /Controles de indicador/);
    assert.match(html, /Cobertura/);
    assert.match(html, /100% Completado/);
    assert.match(html, /0–33% Crítico/);
  });

  it("locks a district overlay required by the active territorial theme", () => {
    const html = renderToStaticMarkup(
      <LayerPanel
        activeOverlays={new Set(["distrito_federal"])}
        requiredOverlay="distrito_federal"
        onToggle={() => undefined}
        hasMunicipioSelected={false}
      />
    );

    assert.match(html, /title="Requerida por el indicador territorial"/);
    assert.match(html, /disabled=""/);
  });
});
