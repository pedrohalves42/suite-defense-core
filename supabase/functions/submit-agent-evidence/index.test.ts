/**
 * Edge Function Test: submit-agent-evidence
 * Validates aggregated event submission (v5.0.14 burst detection).
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

Deno.test("submit-agent-evidence rejects unauthenticated burst alert", async () => {
  const burstPayload = {
    agent_name: "stress-test-agent",
    event_type: "burst_possible_ransomware_burst",
    severity: "critical",
    event_data: {
      burst_type: "possible_ransomware_burst",
      event_type: "file_rename",
      pattern: "*.encrypted",
      count: 500,
      window_seconds: 3,
    },
  };

  const response = await fetch(`${SUPABASE_URL}/functions/v1/submit-agent-evidence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(burstPayload),
  });
  const body = await response.text();
  assertEquals(response.status >= 400, true, `Expected auth rejection for burst, got ${response.status}`);
});

Deno.test("submit-agent-evidence rejects without agent token", async () => {
  const aggregatedPayload = {
    agent_name: "test-agent",
    event_type: "aggregated_event",
    severity: "warning",
    event_data: {
      event_type: "file_write",
      pattern: "*.tmp",
      count: 75,
      duration_seconds: 3,
      burst_detected: false,
      first_seen: new Date().toISOString(),
      last_seen: new Date().toISOString(),
    },
  };

  const response = await fetch(`${SUPABASE_URL}/functions/v1/submit-agent-evidence`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(aggregatedPayload),
  });
  const body = await response.text();
  assertEquals(response.status >= 400, true, `Expected auth rejection, got ${response.status}`);
});
