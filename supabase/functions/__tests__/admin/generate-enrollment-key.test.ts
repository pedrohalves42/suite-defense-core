/**
 * Integration tests: generate-enrollment-key
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callFunction } from "../helpers/test-client.ts";

Deno.test("generate-enrollment-key — rejects unauthenticated", async () => {
  const rawResponse = await fetch(
    `${Deno.env.get("VITE_SUPABASE_URL")}/functions/v1/generate-enrollment-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test-key" }),
    },
  );
  const _text = await rawResponse.text();
  assertEquals(rawResponse.status >= 400, true, `Expected auth rejection, got ${rawResponse.status}`);
});

Deno.test("generate-enrollment-key — rejects with anon key only", async () => {
  const { response } = await callFunction("generate-enrollment-key", {
    body: { name: "test-key" },
  });
  assertEquals(response.status >= 400, true, `Expected 4xx, got ${response.status}`);
});
