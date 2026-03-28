/**
 * Integration tests: evaluate-automation-rules
 * This is an internal/cron function — should reject public calls.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callFunction } from "../helpers/test-client.ts";

Deno.test("evaluate-automation-rules — rejects unauthenticated", async () => {
  const rawResponse = await fetch(
    `${Deno.env.get("VITE_SUPABASE_URL")}/functions/v1/evaluate-automation-rules`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  const _text = await rawResponse.text();
  assertEquals(rawResponse.status >= 400, true, `Expected auth rejection, got ${rawResponse.status}`);
});

Deno.test("evaluate-automation-rules — rejects with anon key (internal only)", async () => {
  const { response } = await callFunction("evaluate-automation-rules", {
    body: {},
  });
  assertEquals(response.status >= 400, true, `Expected rejection for non-internal caller, got ${response.status}`);
});
