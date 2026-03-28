/**
 * Integration tests: enroll-agent
 * Tests agent enrollment endpoint.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callFunction } from "../helpers/test-client.ts";

Deno.test("enroll-agent — rejects unauthenticated", async () => {
  const rawResponse = await fetch(
    `${Deno.env.get("VITE_SUPABASE_URL")}/functions/v1/enroll-agent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrollment_key: "fake-key", agent_name: "test", hostname: "pc" }),
    },
  );
  const _text = await rawResponse.text();
  assertEquals(rawResponse.status >= 400, true, `Expected auth rejection, got ${rawResponse.status}`);
});

Deno.test("enroll-agent — rejects empty payload", async () => {
  const { response } = await callFunction("enroll-agent", {
    body: {},
  });
  assertEquals(response.status >= 400, true, `Expected validation error, got ${response.status}`);
});

Deno.test("enroll-agent — rejects invalid enrollment key", async () => {
  const { response } = await callFunction("enroll-agent", {
    body: {
      enrollment_key: "invalid-key-that-does-not-exist",
      agent_name: "test-agent",
      hostname: "test-pc",
      os_type: "windows",
    },
  });
  assertEquals(response.status >= 400, true, `Expected enrollment key rejection, got ${response.status}`);
});
