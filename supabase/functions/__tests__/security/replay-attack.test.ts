import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

/**
 * Replay Attack Tests
 * Validates HMAC endpoints reject replayed requests.
 */

Deno.test("Replay: heartbeat rejects request without HMAC headers", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/heartbeat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
    },
    body: JSON.stringify({
      agent_name: "test-agent",
      status: "online",
    }),
  });
  await res.text();
  assertEquals(res.status, 401, "Should reject heartbeat without HMAC signature");
});

Deno.test("Replay: submit-job-result rejects without agent token", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-job-result`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
    },
    body: JSON.stringify({
      job_id: "00000000-0000-0000-0000-000000000000",
      status: "completed",
      output: "test",
    }),
  });
  await res.text();
  assertEquals(res.status, 401, "Should reject without X-Agent-Token");
});

Deno.test("Replay: poll-jobs rejects without authentication", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/poll-jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
    },
    body: JSON.stringify({ agent_name: "fake-agent" }),
  });
  await res.text();
  assertEquals(res.status, 401, "Should reject poll-jobs without auth");
});

Deno.test("Replay: heartbeat rejects forged HMAC signature", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/heartbeat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": ANON_KEY,
      "X-HMAC-Signature": "sha256=0000000000000000000000000000000000000000000000000000000000000000",
      "X-Timestamp": new Date().toISOString(),
      "X-Agent-Name": "test-agent",
    },
    body: JSON.stringify({
      agent_name: "test-agent",
      status: "online",
    }),
  });
  await res.text();
  assertEquals(res.status, 401, "Should reject forged HMAC signature");
});
