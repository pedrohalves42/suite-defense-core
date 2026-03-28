/**
 * Integration tests: submit-job-result
 * Tests job result submission endpoint.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callFunction } from "../helpers/test-client.ts";

Deno.test("submit-job-result ? rejects unauthenticated", async () => {
  const rawResponse = await fetch(
    `${Deno.env.get("VITE_SUPABASE_URL")}/functions/v1/submit-job-result`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: "fake", status: "completed", result: {} }),
    },
  );
  const _text = await rawResponse.text();
  assertEquals(rawResponse.status >= 400, true, `Expected auth rejection, got ${rawResponse.status}`);
});

Deno.test("submit-job-result ? rejects without agent token", async () => {
  const { response } = await callFunction("submit-job-result", {
    body: { job_id: "fake", status: "completed", result: {} },
  });
  assertEquals(response.status >= 400, true, `Expected 4xx, got ${response.status}`);
});

Deno.test("submit-job-result ? rejects empty payload", async () => {
  const { response } = await callFunction("submit-job-result", {
    body: {},
    agentToken: "fake-token",
  });
  assertEquals(response.status >= 400, true, `Expected validation error, got ${response.status}`);
});
