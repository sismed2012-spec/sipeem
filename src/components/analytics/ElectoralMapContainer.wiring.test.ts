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
});
