import assert from "node:assert/strict";
import test from "node:test";

import { resolveDemografiaSectionId } from "./demografia-map";

test("uses the stable section id instead of the electoral section number", () => {
  assert.equal(
    resolveDemografiaSectionId({
      seccion_id: 8397,
      SECCION: 4488,
    }),
    8397
  );
});

test("accepts the uppercase stable id emitted by compatible layers", () => {
  assert.equal(resolveDemografiaSectionId({ SECCION_ID: "8397" }), 8397);
});

test("never falls back to the electoral section number", () => {
  assert.equal(resolveDemografiaSectionId({ SECCION: 4488 }), null);
  assert.equal(resolveDemografiaSectionId({ seccion_id: 0, SECCION: 4488 }), null);
  assert.equal(resolveDemografiaSectionId({ seccion_id: 8.5, SECCION: 4488 }), null);
});
