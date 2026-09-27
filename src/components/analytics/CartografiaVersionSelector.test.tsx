import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { CartografiaVersion } from "@/lib/cartografia-versionada";
import { CartografiaVersionSelector } from "./CartografiaVersionSelector";

const versions: CartografiaVersion[] = [
  {
    id: 4025,
    key: "INE_2026_PRE",
    name: "INE 2026 pre-reseccionamiento",
    state: "PUBLICADA",
    cutoffDate: "2026-09-01",
    publicationDate: "2026-09-25",
    expectedPublicationDate: null,
    validFrom: "2026-09-25",
    validUntil: null,
    isDefault: true,
    counts: { SECCION: 7052 },
  },
  {
    id: 5026,
    key: "INE_2026_NUEVA",
    name: "INE 2026 nuevo reseccionamiento",
    state: "ARCHIVADA",
    cutoffDate: "2026-11-12",
    publicationDate: "2026-11-12",
    expectedPublicationDate: null,
    validFrom: "2026-11-12",
    validUntil: null,
    isDefault: false,
    counts: { SECCION: 7100 },
  },
];

describe("CartografiaVersionSelector", () => {
  it("renders the current and historical versions with their status", () => {
    const html = renderToStaticMarkup(
      <CartografiaVersionSelector
        versions={versions}
        selectedVersionId={4025}
        loading={false}
        error={null}
        onChange={() => undefined}
        onRetry={() => undefined}
      />
    );

    assert.match(html, /Cartografía INE/);
    assert.match(html, /INE 2026 pre-reseccionamiento — Vigente/);
    assert.match(html, /INE 2026 nuevo reseccionamiento — Histórica/);
    assert.match(html, /7,052 secciones/);
  });

  it("keeps the control local and retryable when the catalog is unavailable", () => {
    const html = renderToStaticMarkup(
      <CartografiaVersionSelector
        versions={[]}
        selectedVersionId={null}
        loading={false}
        error="No se pudo cargar el catálogo"
        onChange={() => undefined}
        onRetry={() => undefined}
      />
    );

    assert.match(html, /role="alert"/);
    assert.match(html, /No se pudo cargar el catálogo/);
    assert.match(html, />Reintentar</);
  });

  it("assigns unique select identifiers to responsive instances", () => {
    const html = renderToStaticMarkup(
      <>
        <CartografiaVersionSelector
          versions={versions}
          selectedVersionId={4025}
          loading={false}
          error={null}
          onChange={() => undefined}
          onRetry={() => undefined}
        />
        <CartografiaVersionSelector
          versions={versions}
          selectedVersionId={4025}
          loading={false}
          error={null}
          onChange={() => undefined}
          onRetry={() => undefined}
        />
      </>
    );
    const ids = [...html.matchAll(/<select[^>]*id="([^"]+)"/g)].map(
      (match) => match[1]
    );

    assert.equal(ids.length, 2);
    assert.equal(new Set(ids).size, 2);
  });
});
