import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { selfHealForceVersion } from "../force-update.ts";
import type { AgentContext } from "../types.ts";

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
function makeSupabase(releaseData: any) {
  const chain = {
    select: () => chain, eq: () => chain, order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: releaseData, error: null }),
    update: () => chain,
  };
  return { from: () => chain };
}

Deno.test("force-update › selfHealForceVersion returns null when no release", async () => {
  const sb = makeSupabase(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await selfHealForceVersion(sb as any, makeAgent(), "windows", undefined);
  assertEquals(res, null);
});

Deno.test("force-update › selfHealForceVersion recovers release version", async () => {
  const sb = makeSupabase({ version: "5.0.20" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await selfHealForceVersion(sb as any, makeAgent(), "windows", undefined);
  assertEquals(typeof res, "object");
  assertEquals(res!.version, "5.0.20");
});
