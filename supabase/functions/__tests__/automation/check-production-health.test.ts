/**
 * Integration tests: check-production-health
 * Internal/cron function — should reject public calls.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callFunction } from "../helpers/test-client.ts";

Deno.test("check-production-health — rejects unauthenticated", async () => {
  const rawResponse = await fetch(
    `${Deno.env.get("VITE_SUPABASE_URL")}/functions/v1/check-production-health`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  const _text = await rawResponse.text();
  assertEquals(rawResponse.status >= 400, true, `Expected auth rejection, got ${rawResponse.status}`);
});

Deno.test("check-production-health — rejects with anon key (internal only)", async () => {
  const { response } = await callFunction("check-production-health", {
    body: {},
  });
  assertEquals(response.status >= 400, true, `Expected rejection for non-internal caller, got ${response.status}`);
});
