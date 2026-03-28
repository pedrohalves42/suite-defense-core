/**
 * Integration tests: create-job
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callFunction } from "../helpers/test-client.ts";
import { SEED } from "../helpers/seed-data.ts";

Deno.test("create-job ? rejects unauthenticated", async () => {
  const rawResponse = await fetch(
    `${Deno.env.get("VITE_SUPABASE_URL")}/functions/v1/create-job`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(SEED.createJob),
    },
  );
  const _text = await rawResponse.text();
  assertEquals(rawResponse.status >= 400, true, `Expected auth rejection, got ${rawResponse.status}`);
});

Deno.test("create-job ? rejects with anon key only (no JWT)", async () => {
  const { response } = await callFunction("create-job", {
    body: SEED.createJob,
  });
  assertEquals(response.status >= 400, true, `Expected 4xx, got ${response.status}`);
});
