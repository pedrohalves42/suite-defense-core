/**
 * Integration tests: submit-software-inventory
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callFunction } from "../helpers/test-client.ts";
import { SEED } from "../helpers/seed-data.ts";

Deno.test("submit-software-inventory — rejects unauthenticated", async () => {
  const rawResponse = await fetch(
    `${Deno.env.get("VITE_SUPABASE_URL")}/functions/v1/submit-software-inventory`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(SEED.softwareInventory),
    },
  );
  const _text = await rawResponse.text();
  assertEquals(rawResponse.status >= 400, true, `Expected auth rejection, got ${rawResponse.status}`);
});

Deno.test("submit-software-inventory — rejects without agent token", async () => {
  const { response } = await callFunction("submit-software-inventory", {
    body: SEED.softwareInventory,
  });
  assertEquals(response.status >= 400, true, `Expected 4xx, got ${response.status}`);
});
