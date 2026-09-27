import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CartografiaConfigError,
  getCartografiaSupabaseConfig,
} from "./cartografia-config";

describe("getCartografiaSupabaseConfig", () => {
  it("uses only the dedicated cartography credentials", () => {
    const config = getCartografiaSupabaseConfig({
      CARTOGRAFIA_SUPABASE_URL: "https://cartografia.supabase.co/",
      CARTOGRAFIA_SUPABASE_SERVICE_ROLE_KEY: "cartografia-service-role",
      NEXT_PUBLIC_SUPABASE_URL: "https://main-app.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "main-app-service-role",
    });

    assert.deepEqual(config, {
      url: "https://cartografia.supabase.co",
      serviceRoleKey: "cartografia-service-role",
    });
  });

  it("never falls back to the main application credentials", () => {
    assert.throws(
      () =>
        getCartografiaSupabaseConfig({
          NEXT_PUBLIC_SUPABASE_URL: "https://main-app.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: "main-app-service-role",
        }),
      (error: unknown) => {
        assert.ok(error instanceof CartografiaConfigError);
        assert.equal(
          error.message,
          "Faltan CARTOGRAFIA_SUPABASE_URL o CARTOGRAFIA_SUPABASE_SERVICE_ROLE_KEY"
        );
        return true;
      }
    );
  });

  it("requires both dedicated variables", () => {
    assert.throws(
      () =>
        getCartografiaSupabaseConfig({
          CARTOGRAFIA_SUPABASE_URL: "https://cartografia.supabase.co",
        }),
      CartografiaConfigError
    );
    assert.throws(
      () =>
        getCartografiaSupabaseConfig({
          CARTOGRAFIA_SUPABASE_SERVICE_ROLE_KEY: "cartografia-service-role",
        }),
      CartografiaConfigError
    );
  });

  it("rejects unsafe or ambiguous service URLs", () => {
    const invalidUrls = [
      "http://cartografia.supabase.co",
      "not-a-url",
      "https://user:password@cartografia.supabase.co",
      "https://cartografia.supabase.co?project=other",
      "https://cartografia.supabase.co/#fragment",
    ];

    for (const url of invalidUrls) {
      assert.throws(
        () =>
          getCartografiaSupabaseConfig({
            CARTOGRAFIA_SUPABASE_URL: url,
            CARTOGRAFIA_SUPABASE_SERVICE_ROLE_KEY: "cartografia-service-role",
          }),
        CartografiaConfigError
      );
    }
  });
});
