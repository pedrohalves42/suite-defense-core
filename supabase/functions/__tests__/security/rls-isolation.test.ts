import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

/**
 * RLS Isolation Tests
 * Validates that unauthenticated requests cannot access tenant data.
 */

Deno.test("RLS: unauthenticated request to tenant endpoint returns 401", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/action-center-feed`, {
    method: "GET",
    headers: {
      "apikey": ANON_KEY,
      "Content-Type": "application/json",
    },
  });
  await res.text();
  assertEquals(res.status, 401,
    "Tenant endpoint should reject unauthenticated request");
});

Deno.test("RLS: internal endpoint rejects without internal secret", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/mitre-sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
    },
    body: JSON.stringify({ action: "rules" }),
  });
  await res.text();
  // Should return 401 or 403 since no internal secret provided
  assertEquals(res.status >= 400 && res.status < 500, true,
    "Internal endpoint should reject without proper auth");
});

Deno.test("RLS: direct table access blocked without auth", async () => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/agents?select=id,agent_name&limit=1`, {
    method: "GET",
    headers: {
      "apikey": ANON_KEY,
      "Content-Type": "application/json",
    },
  });
  const data = await res.json();
  // RLS should return empty array (no access) not the actual data
  assertEquals(Array.isArray(data), true, "Should return array");
  assertEquals(data.length, 0,
    "RLS should prevent unauthenticated access to agents table");
});

Deno.test("RLS: direct access to sensitive table blocked", async () => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/agent_tokens?select=token_hash&limit=1`, {
    method: "GET",
    headers: {
      "apikey": ANON_KEY,
      "Content-Type": "application/json",
    },
  });
  const data = await res.json();
  assertEquals(Array.isArray(data), true, "Should return array");
  assertEquals(data.length, 0,
    "RLS should prevent access to agent_tokens");
});
