/**
 * Integration tests: scan-vulnerabilities
 * Tests vulnerability scanning endpoint.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callFunction } from "../helpers/test-client.ts";

Deno.test("scan-vulnerabilities — rejects unauthenticated", async () => {
  const rawResponse = await fetch(
    `${Deno.env.get("VITE_SUPABASE_URL")}/functions/v1/scan-vulnerabilities`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: "fake" }),
    },
  );
  const _text = await rawResponse.text();
  assertEquals(rawResponse.status >= 400, true, `Expected auth rejection, got ${rawResponse.status}`);
});

Deno.test("scan-vulnerabilities — rejects without JWT", async () => {
  const { response } = await callFunction("scan-vulnerabilities", {
    body: { agent_id: "fake-agent-id" },
  });
  // Uses serveTenant — should reject without proper JWT
  assertEquals(response.status >= 400, true, `Expected 4xx, got ${response.status}`);
});
