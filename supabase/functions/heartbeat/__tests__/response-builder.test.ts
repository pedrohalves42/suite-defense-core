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
  const chain = {
    select: () => chain, eq: () => chain, order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: releaseData, error: null }),
    single: async () => ({ data: releaseData, error: null }),
  };
  return { from: () => chain };
}

Deno.test("response-builder › buildNormalResponse returns ok:true with no release", async () => {
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
});
