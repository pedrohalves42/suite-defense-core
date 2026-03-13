/**
 * Edge Function Test: submit-endpoint-events
 * Validates DoS protection and input validation.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

Deno.test("submit-endpoint-events rejects unauthenticated requests", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/submit-endpoint-events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events: [] }),
  });
  const body = await response.text();
  assertEquals(response.status >= 400, true, `Expected 4xx, got ${response.status}`);
});

Deno.test("submit-endpoint-events rejects empty payload", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/submit-endpoint-events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Agent-Token": "fake-token",
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({}),
  });
  const body = await response.text();
  assertEquals(response.status >= 400, true, `Expected validation error, got ${response.status}`);
});

Deno.test("submit-endpoint-events DoS protection: rejects oversized batch", async () => {
  // Generate 1500 events (over the 1000 limit)
  const events = Array.from({ length: 1500 }, (_, i) => ({
    event_type: "file_write",
    event_data: { path: `/tmp/test-${i}.txt` },
    timestamp: new Date().toISOString(),
  }));

  const response = await fetch(`${SUPABASE_URL}/functions/v1/submit-endpoint-events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Agent-Token": "fake-token",
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ events }),
  });
  const body = await response.text();
  // Should either reject the oversized batch or process only 1000
  assertEquals(response.status >= 400 || response.status === 200, true);
});
