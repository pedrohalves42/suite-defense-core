import { assertEquals, assertNotEquals } from "https://deno.land/std@0.203.0/testing/asserts.ts";
import { spy, stub } from "https://deno.land/std@0.203.0/testing/mock.ts";
import { selfHealForceVersion, maybeAutoArmSameVersionRemediation } from "../force-update.ts";

function createMockQuery(data: any, error: any = null) {
  const query: any = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: () => query,
    maybeSingle: () => Promise.resolve({ data, error }),
    is: () => query,
    gte: () => query,
    update: () => query,
  };
  return query;
}

Deno.test("selfHealForceVersion - should return release when found", async () => {
  const mockRelease = { version: "1.2.3", platform: "windows" };
  const mockSupabase = {
    from: () => createMockQuery(mockRelease)
  };

  const agent = { id: "agent-1", agent_name: "test-agent" } as any;
  const result = await selfHealForceVersion(mockSupabase, agent, "windows", "1.2.3");

  assertNotEquals(result, null);
  assertEquals(result?.version, "1.2.3");
  assertEquals(result?.prefetchedRelease, mockRelease);
});

Deno.test("maybeAutoArmSameVersionRemediation - should trigger update for degraded windows agent", async () => {
  const mockRelease = { version: "1.2.3", platform: "windows" };
  const updateSpy = spy(() => createMockQuery(null));

  const mockSupabase = {
    from: (table: string) => {
      if (table === 'agent_releases') {
        return createMockQuery(mockRelease);
      }
      return {
        update: updateSpy
      };
    }
  };

  const agent = { 
    id: "agent-1", 
    agent_name: "test-agent", 
    state: "DEGRADED",
    agent_version: "1.2.3"
  } as any;
  
  const updateData = { state: "DEGRADED" } as any;

  const result = await maybeAutoArmSameVersionRemediation(
    mockSupabase,
    agent,
    updateData,
    "1.2.3",
    "windows"
  );

  assertNotEquals(result, null);
  assertEquals(result?.version, "1.2.3");
  assertEquals(result?.overrideSafeMode, true);
  
  // Verify that the agent was updated with force_update fields
  assertEquals(updateSpy.calls.length, 1);
  const updateArg = (updateSpy.calls[0].args[0] as any);
  assertEquals(updateArg.force_update_version, "1.2.3");
  assertEquals(updateArg.force_update_override_safe_mode, true);
});

Deno.test("maybeAutoArmSameVersionRemediation - should not trigger if on cooldown", async () => {
  const agent = { 
    id: "agent-1", 
    agent_name: "test-agent", 
    state: "DEGRADED",
    agent_version: "1.2.3",
    last_forced_update_applied: new Date().toISOString() // Just applied
  } as any;
  
  const result = await maybeAutoArmSameVersionRemediation(
    {} as any,
    agent,
    { state: "DEGRADED" } as any,
    "1.2.3",
    "windows"
  );

  assertEquals(result, null);
});

Deno.test("maybeAutoArmSameVersionRemediation - should not trigger for non-windows", async () => {
  const agent = { 
    id: "agent-1", 
    agent_name: "test-agent", 
    state: "DEGRADED",
    agent_version: "1.2.3"
  } as any;
  
  const result = await maybeAutoArmSameVersionRemediation(
    {} as any,
    agent,
    { state: "DEGRADED" } as any,
    "1.2.3",
    "linux"
  );

  assertEquals(result, null);
});
