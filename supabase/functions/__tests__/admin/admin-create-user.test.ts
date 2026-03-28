/**
 * Integration tests: admin-create-user
 * Tests admin user creation endpoint.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callFunction } from "../helpers/test-client.ts";
import { SEED } from "../helpers/seed-data.ts";

Deno.test("admin-create-user ? rejects unauthenticated", async () => {
  const rawResponse = await fetch(
    `${Deno.env.get("VITE_SUPABASE_URL")}/functions/v1/admin-create-user`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(SEED.createUser),
    },
  );
  const _text = await rawResponse.text();
  assertEquals(rawResponse.status >= 400, true, `Expected auth rejection, got ${rawResponse.status}`);
});

Deno.test("admin-create-user ? rejects with anon key only (no JWT)", async () => {
  const { response } = await callFunction("admin-create-user", {
    body: SEED.createUser,
  });
  assertEquals(response.status >= 400, true, `Expected 4xx, got ${response.status}`);
});

Deno.test("admin-create-user ? rejects empty payload", async () => {
  const { response } = await callFunction("admin-create-user", {
    body: {},
  });
  assertEquals(response.status >= 400, true, `Expected validation error, got ${response.status}`);
});
