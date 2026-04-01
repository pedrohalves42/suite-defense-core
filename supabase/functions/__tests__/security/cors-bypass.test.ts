import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

/**
 * CORS Bypass Tests
 * Validates that edge functions reject requests from unauthorized origins
 * and accept requests from allowed origins.
 */

Deno.test("CORS: rejects request with unauthorized origin", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/action-center-feed`, {
    method: "OPTIONS",
    headers: {
      "Origin": "https://evil-attacker.com",
      "Access-Control-Request-Method": "POST",
      "apikey": ANON_KEY,
    },
  });
  const body = await res.text();
  const allowOrigin = res.headers.get("Access-Control-Allow-Origin");
  // Should NOT return the evil origin
  assertNotEquals(allowOrigin, "https://evil-attacker.com",
    "CORS should not reflect unauthorized origin");
});

Deno.test("CORS: accepts request from allowed origin", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/health`, {
    method: "GET",
    headers: {
      "Origin": "https://cybershield.com.br",
      "apikey": ANON_KEY,
    },
  });
  await res.text();
  // Health endpoint should respond successfully
  assertEquals(res.status < 500, true, "Should not return 5xx for allowed origin");
});

Deno.test("CORS: wildcard origin not reflected", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/health`, {
    method: "OPTIONS",
    headers: {
      "Origin": "*",
      "Access-Control-Request-Method": "GET",
      "apikey": ANON_KEY,
    },
  });
  await res.text();
  const allowOrigin = res.headers.get("Access-Control-Allow-Origin");
  assertNotEquals(allowOrigin, "*",
    "CORS should never return wildcard origin");
});
