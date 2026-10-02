import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DemografiaConfigError,
  getDemografiaSupabaseConfig,
} from "./demografia-config";

describe("getDemografiaSupabaseConfig", () => {
  it("uses only the dedicated territorial database credentials", () => {
    assert.deepEqual(
      getDemografiaSupabaseConfig({
        CARTOGRAFIA_SUPABASE_URL: "https://sipeem-dev.supabase.co/",
        CARTOGRAFIA_SUPABASE_SERVICE_ROLE_KEY: "dev-territorial-secret",
        NEXT_PUBLIC_SUPABASE_URL: "https://main-auth.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "main-auth-secret",
      }),
      {
        url: "https://sipeem-dev.supabase.co",
        serviceRoleKey: "dev-territorial-secret",
      }
    );
  });

  it("never falls back to the main authentication database", () => {
    assert.throws(
      () =>
        getDemografiaSupabaseConfig({
          NEXT_PUBLIC_SUPABASE_URL: "https://main-auth.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: "main-auth-secret",
        }),
      (error: unknown) => {
        assert.ok(error instanceof DemografiaConfigError);
        assert.equal(
          error.message,
          "Faltan CARTOGRAFIA_SUPABASE_URL o CARTOGRAFIA_SUPABASE_SERVICE_ROLE_KEY"
        );
        return true;
      }
    );
  });

  it("rejects non-HTTPS and credential-bearing URLs", () => {
    for (const url of [
      "http://sipeem-dev.supabase.co",
      "https://user:password@sipeem-dev.supabase.co",
      "https://sipeem-dev.supabase.co?project=other",
    ]) {
      assert.throws(
        () =>
          getDemografiaSupabaseConfig({
            CARTOGRAFIA_SUPABASE_URL: url,
            CARTOGRAFIA_SUPABASE_SERVICE_ROLE_KEY: "dev-territorial-secret",
          }),
        DemografiaConfigError
      );
    }
  });
});
