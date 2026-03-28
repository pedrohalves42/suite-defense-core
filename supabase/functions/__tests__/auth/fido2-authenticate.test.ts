/**
 * Integration tests: fido2-authenticate
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callFunction } from "../helpers/test-client.ts";

Deno.test("fido2-authenticate — rejects unauthenticated", async () => {
  const rawResponse = await fetch(
    `${Deno.env.get("VITE_SUPABASE_URL")}/functions/v1/fido2-authenticate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate-options" }),
    },
  );
  const _text = await rawResponse.text();
  assertEquals(rawResponse.status >= 400, true, `Expected auth rejection, got ${rawResponse.status}`);
});

Deno.test("fido2-authenticate — rejects with anon key only", async () => {
  const { response } = await callFunction("fido2-authenticate", {
    body: { action: "generate-options", email: "test@example.com" },
  });
  assertEquals(response.status >= 400, true, `Expected 4xx, got ${response.status}`);
});
