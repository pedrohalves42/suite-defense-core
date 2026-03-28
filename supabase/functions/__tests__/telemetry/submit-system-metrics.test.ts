/**
 * Integration tests: submit-system-metrics
 * Tests system metrics submission from agents.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callFunction } from "../helpers/test-client.ts";
import { SEED } from "../helpers/seed-data.ts";

Deno.test("submit-system-metrics ? rejects unauthenticated", async () => {
  const rawResponse = await fetch(
    `${Deno.env.get("VITE_SUPABASE_URL")}/functions/v1/submit-system-metrics`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(SEED.systemMetrics),
    },
  );
  const _text = await rawResponse.text();
  assertEquals(rawResponse.status >= 400, true, `Expected auth rejection, got ${rawResponse.status}`);
});

Deno.test("submit-system-metrics ? rejects without agent token", async () => {
  const { response } = await callFunction("submit-system-metrics", {
    body: SEED.systemMetrics,
  });
  assertEquals(response.status >= 400, true, `Expected 4xx, got ${response.status}`);
});

Deno.test("submit-system-metrics ? rejects invalid agent token", async () => {
  const { response } = await callFunction("submit-system-metrics", {
    body: SEED.systemMetrics,
    agentToken: "invalid-token",
  });
  assertEquals(response.status >= 400, true, `Expected 4xx, got ${response.status}`);
});
