import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

Deno.test("Security: Bucket 'agent-scripts' listing is blocked for anon", async () => {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/agent-scripts`, {
    method: "POST", // List is a POST in Supabase Storage API
    headers: {
      "apikey": ANON_KEY,
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ANON_KEY}`
    },
    body: JSON.stringify({
      prefix: "",
      limit: 100,
      offset: 0,
      sortBy: { column: "name", order: "asc" }
    })
  });
  
  const data = await res.json();
  
  // If the bucket is private and no policies allow listing, it should return error or empty
  // Usually returns 401 or 403
  assertEquals(res.status >= 400, true, "Bucket listing should be restricted");
});

Deno.test("Security: agent_hmac_signatures RLS validation", async () => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/agent_hmac_signatures?select=*&limit=1`, {
    method: "GET",
    headers: {
      "apikey": ANON_KEY,
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ANON_KEY}`
    }
  });
  
  const data = await res.json();
  
  // Should return empty array or 401/403 (depending on if RLS is enabled without policy)
  // If RLS is enabled but no policies, SELECT returns empty array
  if (res.status === 200) {
    assertEquals(data.length, 0, "Anon should not see any HMAC signatures");
  } else {
    assertEquals(res.status >= 400, true, "Access to HMAC signatures should be restricted");
  }
});
