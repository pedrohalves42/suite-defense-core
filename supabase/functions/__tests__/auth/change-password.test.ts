/**
 * Integration tests: change-password
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callFunction } from "../helpers/test-client.ts";

Deno.test("change-password — rejects unauthenticated", async () => {
  const rawResponse = await fetch(
    `${Deno.env.get("VITE_SUPABASE_URL")}/functions/v1/change-password`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: "old", new_password: "New123!@#" }),
    },
  );
  const _text = await rawResponse.text();
  assertEquals(rawResponse.status >= 400, true, `Expected auth rejection, got ${rawResponse.status}`);
});

Deno.test("change-password — rejects with anon key only", async () => {
  const { response } = await callFunction("change-password", {
    body: { current_password: "old", new_password: "New123!@#" },
  });
  assertEquals(response.status >= 400, true, `Expected 4xx, got ${response.status}`);
});

Deno.test("change-password — rejects empty payload", async () => {
  const { response } = await callFunction("change-password", {
    body: {},
  });
  assertEquals(response.status >= 400, true, `Expected validation error, got ${response.status}`);
});
