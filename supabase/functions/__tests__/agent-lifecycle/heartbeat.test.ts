/**
 * Integration tests: heartbeat
 * Tests agent heartbeat endpoint authentication and validation.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callFunction, assertError } from "../helpers/test-client.ts";
import { SEED } from "../helpers/seed-data.ts";

Deno.test("heartbeat — rejects unauthenticated requests", async () => {
  const { response, text } = await callFunction("heartbeat", {
    body: SEED.heartbeat,
    headers: {},
  });
  // Remove apikey to force auth failure
  const rawResponse = await fetch(
    `${Deno.env.get("VITE_SUPABASE_URL")}/functions/v1/heartbeat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(SEED.heartbeat),
    },
  );
  const rawText = await rawResponse.text();
  assertEquals(rawResponse.status >= 400, true, `Expected auth rejection, got ${rawResponse.status}`);
});

Deno.test("heartbeat — rejects missing agent token", async () => {
  const { response } = await callFunction("heartbeat", {
    body: SEED.heartbeat,
  });
  // Without X-Agent-Token, should fail auth
  assertEquals(response.status >= 400, true, `Expected 4xx without agent token, got ${response.status}`);
});

Deno.test("heartbeat — rejects invalid agent token", async () => {
  const { response } = await callFunction("heartbeat", {
    body: SEED.heartbeat,
    agentToken: "invalid-token-that-does-not-exist",
  });
  assertEquals(response.status >= 400, true, `Expected 4xx with invalid token, got ${response.status}`);
});

Deno.test("heartbeat — rejects empty body", async () => {
  const { response } = await callFunction("heartbeat", {
    body: {},
    agentToken: "fake-token",
  });
  assertEquals(response.status >= 400, true, `Expected validation error, got ${response.status}`);
});

Deno.test("heartbeat — rejects GET method", async () => {
  const rawResponse = await fetch(
    `${Deno.env.get("VITE_SUPABASE_URL")}/functions/v1/heartbeat`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "apikey": Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!,
      },
    },
  );
  const rawText = await rawResponse.text();
  assertEquals(rawResponse.status >= 400, true, `Expected method rejection, got ${rawResponse.status}`);
});
