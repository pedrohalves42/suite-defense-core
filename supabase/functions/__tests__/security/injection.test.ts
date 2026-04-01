import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

/**
 * Injection Tests
 * Validates that edge functions reject malformed/malicious payloads.
 */

Deno.test("Injection: rejects oversized payload", async () => {
  const hugePayload = JSON.stringify({ action: "x".repeat(10000) });
  const res = await fetch(`${SUPABASE_URL}/functions/v1/cleanup-router`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
    },
    body: hugePayload,
  });
  await res.text();
  assertEquals(res.status, 400, "Should reject oversized action field");
});

Deno.test("Injection: rejects empty body on POST endpoint", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/cleanup-router`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
    },
    body: "{}",
  });
  await res.text();
  assertEquals(res.status, 400, "Should reject POST with missing required fields");
});

Deno.test("Injection: rejects non-JSON content type", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/cleanup-router`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "apikey": ANON_KEY,
    },
    body: "<script>alert(1)</script>",
  });
  await res.text();
  // Should return 400 or 415, not 200
  assertNotEquals(res.status, 200, "Should not accept non-JSON content");
});

function assertNotEquals(actual: unknown, notExpected: unknown, msg: string) {
  if (actual === notExpected) throw new Error(msg);
}

Deno.test("Injection: rejects SQL-like strings in action field", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/cleanup-router`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
    },
    body: JSON.stringify({ action: "'; DROP TABLE agents; --" }),
  });
  const body = await res.json();
  // Should return 400 (unknown action) not execute SQL
  assertEquals(res.status >= 400 && res.status < 500, true,
    "Should reject SQL injection attempt with 4xx");
});
