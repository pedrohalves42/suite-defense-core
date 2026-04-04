import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { buildNormalResponse } from "../response-builder.ts";
import type { AgentContext, AgentUpdate } from "../types.ts";

function makeAgent(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    id: "x", agent_name: "a", tenant_id: "t1", hmac_secret: "s",
    status: "active", skip_firewall_remediation: false, agent_version: null,
    force_update_version: null, force_update_reason: null, force_update_at: null,
    force_update_override_safe_mode: false, force_update_override_safe_mode_expires_at: null,
    force_update_delivered_count: 0, force_update_first_delivered_at: null,
    last_forced_update_applied: null,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSupabaseMock(releaseData: any = null) {
  return {
    from: (_table: string) => {
      const chain = {
        select: () => chain, eq: () => chain, order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: releaseData, error: null }),
      };
      return chain;
    },
  };
}

Deno.test("response-builder › returns ok:true with no release data", async () => {
  const sb = makeSupabaseMock(null);
  const agent = makeAgent();
  const updateData: AgentUpdate = { last_heartbeat: new Date().toISOString(), status: "active", os_type: "windows" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await buildNormalResponse(sb as any, agent, updateData, "5.0.15", "windows", null);
  assertEquals(res instanceof Response, true);
  const j = await res.json();
  assertEquals(j.ok, true);
  assertExists(j.timestamp);
  assertEquals(Array.isArray(j.jobs), true);
  assertEquals(j.jobs.length, 0);
  assertEquals(j.script_sha256, null, "No hash without release");
  assertEquals(j.script_hash_signature, null, "No signature without release");
  assertEquals(j.force_hash_resync, false, "No resync without hash");
});

Deno.test("response-builder › returns hash+signature when release is signed", async () => {
  const signedRelease = {
    script_content: "echo hello",
    signature_base64: "dGVzdHNpZw==",
    signed_at: "2026-01-01T00:00:00Z",
  };
  const sb = makeSupabaseMock(signedRelease);
  const agent = makeAgent({ status: "active", state: "ENFORCING" });
  const updateData: AgentUpdate = { last_heartbeat: new Date().toISOString(), status: "active", state: "ENFORCING" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await buildNormalResponse(sb as any, agent, updateData, "5.0.15", "linux", null);
  const j = await res.json();
  assertEquals(typeof j.script_sha256, "string", "Hash should be present for signed release");
  assertEquals(j.script_sha256.length, 64, "SHA-256 hash should be 64 hex chars");
  assertEquals(j.script_hash_signature, "dGVzdHNpZw==", "Signature must be returned");
  assertEquals(j.script_hash_signed_at, "2026-01-01T00:00:00Z");
  assertEquals(j.force_hash_resync, false, "ENFORCING agents should not get resync");
});

Deno.test("response-builder › does NOT return hash when release lacks signature", async () => {
  const unsignedRelease = {
    script_content: "echo hello",
    signature_base64: null,
    signed_at: null,
  };
  const sb = makeSupabaseMock(unsignedRelease);
  const agent = makeAgent();
  const updateData: AgentUpdate = { last_heartbeat: new Date().toISOString(), status: "active" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await buildNormalResponse(sb as any, agent, updateData, "5.0.15", "linux", null);
  const j = await res.json();
  assertEquals(j.script_sha256, null, "No hash without signature (prevents TOCTOU false positives)");
  assertEquals(j.script_hash_signature, null, "No signature when release is unsigned");
});

Deno.test("response-builder › force_hash_resync true for SAFE_MODE agents with status=active", async () => {
  const signedRelease = {
    script_content: "echo hello",
    signature_base64: "dGVzdHNpZw==",
    signed_at: "2026-01-01T00:00:00Z",
  };
  const sb = makeSupabaseMock(signedRelease);
  // Key fix: status is 'active' (what heartbeat actually writes), state from payload
  const agent = makeAgent({ status: "active" });
  const updateData: AgentUpdate = { last_heartbeat: new Date().toISOString(), status: "active", state: "SAFE_MODE" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await buildNormalResponse(sb as any, agent, updateData, "5.0.15", "linux", null);
  const j = await res.json();
  assertEquals(j.force_hash_resync, true, "SAFE_MODE agents with active status should get resync signal");
  assertEquals(typeof j.script_sha256, "string", "Hash must accompany resync signal");
  assertEquals(typeof j.script_hash_signature, "string", "Signature must accompany resync signal");
});

Deno.test("response-builder › force_hash_resync true for DEGRADED agents with status=online (legacy)", async () => {
  const signedRelease = {
    script_content: "echo hello",
    signature_base64: "dGVzdHNpZw==",
    signed_at: "2026-01-01T00:00:00Z",
  };
  const sb = makeSupabaseMock(signedRelease);
  const agent = makeAgent({ status: "online", state: "DEGRADED" });
  const updateData: AgentUpdate = { last_heartbeat: new Date().toISOString(), status: "online" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await buildNormalResponse(sb as any, agent, updateData, "5.0.15", "windows", null);
  const j = await res.json();
  assertEquals(j.force_hash_resync, true, "DEGRADED agents with online status should get resync signal");
});

Deno.test("response-builder › no resync for ENFORCING agents", async () => {
  const signedRelease = {
    script_content: "echo hello",
    signature_base64: "dGVzdHNpZw==",
    signed_at: "2026-01-01T00:00:00Z",
  };
  const sb = makeSupabaseMock(signedRelease);
  const agent = makeAgent({ status: "active", state: "ENFORCING" });
  const updateData: AgentUpdate = { last_heartbeat: new Date().toISOString(), status: "active", state: "ENFORCING" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await buildNormalResponse(sb as any, agent, updateData, "5.0.15", "windows", null);
  const j = await res.json();
  assertEquals(j.force_hash_resync, false, "ENFORCING agents should not get resync");
  assertEquals(typeof j.script_sha256, "string", "Hash still provided for normal integrity checks");
});
