/**
 * Integration tests: poll-jobs
 * Tests agent job polling endpoint.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callFunction } from "../helpers/test-client.ts";

Deno.test("poll-jobs ? rejects unauthenticated requests", async () => {
  const rawResponse = await fetch(
    `${Deno.env.get("VITE_SUPABASE_URL")}/functions/v1/poll-jobs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  const _text = await rawResponse.text();
  assertEquals(rawResponse.status >= 400, true, `Expected auth rejection, got ${rawResponse.status}`);
});

Deno.test("poll-jobs ? rejects without agent token", async () => {
  const { response } = await callFunction("poll-jobs", {
    body: {},
  });
  assertEquals(response.status >= 400, true, `Expected 4xx without agent token, got ${response.status}`);
});

Deno.test("poll-jobs ? rejects invalid agent token", async () => {
  const { response } = await callFunction("poll-jobs", {
    body: {},
    agentToken: "invalid-token",
  });
  assertEquals(response.status >= 400, true, `Expected 4xx with bad token, got ${response.status}`);
});
