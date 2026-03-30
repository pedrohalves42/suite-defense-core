/**
 * Integration tests: execute-playbook-action
 * Tests the playbook execution admin endpoint.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callFunction } from "../helpers/test-client.ts";

Deno.test("execute-playbook-action → rejects unauthenticated requests", async () => {
  const rawResponse = await fetch(
    `${Deno.env.get("VITE_SUPABASE_URL")}/functions/v1/execute-playbook-action`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ execution_id: "fake", action_type: "notify" }),
    },
  );
  const _text = await rawResponse.text();
  assertEquals(rawResponse.status >= 400, true, `Expected auth rejection, got ${rawResponse.status}`);
});

Deno.test("execute-playbook-action → rejects without JWT", async () => {
  const { response } = await callFunction("execute-playbook-action", {
    body: { execution_id: "fake-id", action_type: "notify" },
  });
  assertEquals(response.status >= 400, true, `Expected 4xx without JWT, got ${response.status}`);
});

Deno.test("execute-playbook-action → rejects empty payload", async () => {
  const { response } = await callFunction("execute-playbook-action", {
    body: {},
  });
  assertEquals(response.status >= 400, true, `Expected validation error, got ${response.status}`);
});

Deno.test("execute-playbook-action → rejects GET method", async () => {
  const rawResponse = await fetch(
    `${Deno.env.get("VITE_SUPABASE_URL")}/functions/v1/execute-playbook-action`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "apikey": Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!,
      },
    },
  );
  const _text = await rawResponse.text();
  assertEquals(rawResponse.status >= 400, true, `Expected method rejection, got ${rawResponse.status}`);
});
