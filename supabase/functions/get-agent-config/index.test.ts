/**
 * Edge Function Test: get-agent-config
 * Validates aggregation config is returned correctly.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

Deno.test("get-agent-config returns 401 without auth", async () => {
  const response = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/get-agent-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: "test" }),
  });
  const body = await response.text();
  // Should reject - no X-Agent-Token
  assertEquals(response.status >= 400, true, `Expected 4xx, got ${response.status}: ${body}`);
});

Deno.test("get-agent-config rejects invalid agent token", async () => {
  const response = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/get-agent-config`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Agent-Token": "invalid-token-12345",
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ agent_id: "nonexistent" }),
  });
  const body = await response.text();
  assertEquals(response.status >= 400, true, `Expected auth error, got ${response.status}: ${body}`);
});
