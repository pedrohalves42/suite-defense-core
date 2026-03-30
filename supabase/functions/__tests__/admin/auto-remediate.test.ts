/**
 * Integration tests: auto-remediate
 * Tests the auto-remediate admin endpoint.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callFunction } from "../helpers/test-client.ts";

Deno.test("auto-remediate → rejects unauthenticated requests", async () => {
  const rawResponse = await fetch(
    `${Deno.env.get("VITE_SUPABASE_URL")}/functions/v1/auto-remediate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  const _text = await rawResponse.text();
  assertEquals(rawResponse.status >= 400, true, `Expected auth rejection, got ${rawResponse.status}`);
});

Deno.test("auto-remediate → rejects without Authorization header", async () => {
  const { response } = await callFunction("auto-remediate", {
    body: { agent_id: "fake-id", action: "quarantine" },
  });
  // Should require JWT auth (verify_jwt = true) or serveTenant auth
  assertEquals(response.status >= 400, true, `Expected 4xx without JWT, got ${response.status}`);
});

Deno.test("auto-remediate → rejects empty payload", async () => {
  const { response } = await callFunction("auto-remediate", {
    body: {},
  });
  assertEquals(response.status >= 400, true, `Expected validation error, got ${response.status}`);
});

Deno.test("auto-remediate → rejects GET method", async () => {
  const rawResponse = await fetch(
    `${Deno.env.get("VITE_SUPABASE_URL")}/functions/v1/auto-remediate`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "apikey": Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!,
      },
    },
  );
  const _text = await rawResponse.text();
  assertEquals(rawResponse.status >= 400, true, `Expected method rejection, got ${rawResponse.status}`);
});
