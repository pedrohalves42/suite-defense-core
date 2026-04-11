import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { maybeAutoArmSameVersionRemediation, selfHealForceVersion } from "../force-update.ts";
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

function makeUpdate(overrides: Partial<AgentUpdate> = {}): AgentUpdate {
  return {
    last_heartbeat: new Date().toISOString(),
    status: "active",
    ...overrides,
  };
}

const FAKE_RELEASE = {
  id: "rel-1",
  version: "5.0.20",
  script_content: "echo hello",
  sha256: "abc123",
  signature_base64: null,
  signed_at: null,
  signed_by: null,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSupabase(releaseData: any = null, updateError: any = null) {
  const fullRelease = releaseData ? { ...FAKE_RELEASE, ...releaseData } : null;
  const updates: Array<{ table: string; values: Record<string, unknown> }> = [];

  return {
    updates,
    from: (table: string) => {
      if (table === "agent_releases") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({ data: fullRelease, error: null }),
        };
        return chain;
      }

      if (table === "agents") {
        return {
          update: (values: Record<string, unknown>) => {
            updates.push({ table, values });
            return { eq: async () => ({ error: updateError }) };
          },
        };
      }

      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return chain;
    },
  };
}

Deno.test("force-update › selfHealForceVersion returns null when no release", async () => {
  const sb = makeSupabase(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await selfHealForceVersion(sb as any, makeAgent(), "windows", undefined);
  assertEquals(res, null);
});

Deno.test("force-update › selfHealForceVersion recovers release version and includes prefetchedRelease", async () => {
  const sb = makeSupabase({ version: "5.0.20" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await selfHealForceVersion(sb as any, makeAgent(), "windows", undefined);
  assertEquals(typeof res, "object");
  assertEquals(res!.version, "5.0.20");
  assertEquals(res!.prefetchedRelease.version, "5.0.20");
  assertEquals(typeof res!.prefetchedRelease.id, "string");
});

Deno.test("force-update › auto-remediation arms same-version delivery for degraded windows agents", async () => {
  const sb = makeSupabase({ version: "5.0.15" });
  const agent = makeAgent({ state: "SAFE_MODE", agent_version: "5.0.15" });
  const update = makeUpdate({ state: "SAFE_MODE", agent_version: "5.0.15" });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await maybeAutoArmSameVersionRemediation(sb as any, agent, update, "5.0.15", "windows");

  assertEquals(res?.version, "5.0.15");
  assertEquals(res?.omitPayloadSignature, true);
  assertEquals(res?.overrideSafeMode, true);
  assertEquals(typeof res?.prefetchedRelease.id, "string");
  assertEquals(sb.updates.length, 1);
  assertEquals(sb.updates[0].values.force_update_version, "5.0.15");
  assertEquals(sb.updates[0].values.force_update_override_safe_mode, true);
});

Deno.test("force-update › auto-remediation skips recently applied same-version updates", async () => {
  const sb = makeSupabase({ version: "5.0.15" });
  const agent = makeAgent({
    state: "DEGRADED",
    agent_version: "5.0.15",
    last_forced_update_applied: new Date().toISOString(),
  });
  const update = makeUpdate({ state: "DEGRADED", agent_version: "5.0.15" });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await maybeAutoArmSameVersionRemediation(sb as any, agent, update, "5.0.15", "windows");

  assertEquals(res, null);
  assertEquals(sb.updates.length, 0);
});
