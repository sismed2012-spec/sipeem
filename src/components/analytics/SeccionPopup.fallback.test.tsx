import assert from "node:assert/strict";
import { it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { SeccionPopup } from "./SeccionPopup";

it("keeps basic section details visible without requesting versioned data", () => {
  const html = renderToStaticMarkup(
    <SeccionPopup
      seccion={{
        seccionId: null,
        numero: 123,
        municipio: "Toluca",
        municipioClave: "106",
        dto_federal: 34,
        dto_local: 2,
        tipo: "URBANA",
        control: 1,
        municipioId: 106,
      }}
      cartografiaVersionId={null}
      onClose={() => undefined}
    />,
  );

  assert.match(html, /Sección 123/);
  assert.match(html, /Toluca/);
  assert.match(html, /Datos demográficos y nominales no disponibles sin versión cartográfica/);
});
