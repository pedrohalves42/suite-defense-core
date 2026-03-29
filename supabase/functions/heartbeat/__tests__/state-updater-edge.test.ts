/**
 * Extended state-updater tests — DB failure handling and edge cases.
 */
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { updateAgentStatus, executeParallelOps } from "../state-updater.ts";
import type { AgentContext, AgentUpdate, OSInfo } from "../types.ts";

interface MockCall {
  table: string;
  method: string;
  // deno-lint-ignore no-explicit-any
  data?: any;
}

function mockSupabaseWithError(errorTable: string) {
  const calls: MockCall[] = [];
  const errorChain: Record<string, unknown> = {
    eq: () => errorChain,
    lt: () => errorChain,
    then: (cb: (v: { data: null; error: { message: string; details: string; hint: string } }) => void) => {
      cb({ data: null, error: { message: "DB error", details: "test", hint: "test" } });
      return Promise.resolve();
    },
  };
  const okChain: Record<string, unknown> = {
    eq: () => okChain,
    lt: () => okChain,
    then: (cb: (v: { data: null; error: null }) => void) => {
      cb({ data: null, error: null });
      return Promise.resolve();
    },
  };
  return {
    calls,
    from: (table: string) => {
      const chain = table === errorTable ? errorChain : okChain;
      return {
        // deno-lint-ignore no-explicit-any
        update: (data: any) => { calls.push({ table, method: "update", data }); return chain; },
        // deno-lint-ignore no-explicit-any
        insert: (data: any) => { calls.push({ table, method: "insert", data }); return chain; },
        delete: () => { calls.push({ table, method: "delete" }); return chain; },
      };
    },
  };
}

function makeAgent(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    id: "a1", agent_name: "test", tenant_id: "t1", hmac_secret: "s",
    status: "active", skip_firewall_remediation: false, agent_version: null,
    force_update_version: null, force_update_reason: null, force_update_at: null,
    force_update_override_safe_mode: false, force_update_override_safe_mode_expires_at: null,
    force_update_delivered_count: 0, force_update_first_delivered_at: null,
    last_forced_update_applied: null,
    ...overrides,
  };
}

Deno.test("state-updater-edge › updateAgentStatus handles DB error gracefully", async () => {
  // deno-lint-ignore no-explicit-any
  const sb = mockSupabaseWithError("agents") as any;
  const update: AgentUpdate = { last_heartbeat: new Date().toISOString(), status: "active" };
  // Should not throw — errors are logged but not propagated
  await updateAgentStatus(sb, "agent-id-1", "agent1", update);
  const call = sb.calls.find((c: MockCall) => c.table === "agents" && c.method === "update");
  assertExists(call, "agents.update should still be called even if it errors");
});

Deno.test("state-updater-edge › executeParallelOps handles metrics insert failure", async () => {
  // deno-lint-ignore no-explicit-any
  const sb = mockSupabaseWithError("agent_system_metrics_partitioned") as any;
  const agent = makeAgent();
  const osInfo: OSInfo = {
    system_metrics: { cpu_percent: 10, memory_total_gb: 16, memory_used_gb: 8 },
  };
  // Should not throw — errors are fire-and-forget
  await executeParallelOps(sb, agent, osInfo);
  const call = sb.calls.find((c: MockCall) => c.table === "agent_system_metrics_partitioned");
  assertExists(call, "Should attempt metrics insert even if it will fail");
});

Deno.test("state-updater-edge › executeParallelOps with no metrics or processes", async () => {
  const calls: MockCall[] = [];
  const chain: Record<string, unknown> = {
    eq: () => chain,
    lt: () => chain,
    then: (cb: (v: { data: null; error: null }) => void) => {
      cb({ data: null, error: null });
      return Promise.resolve();
    },
  };
  const sb = {
    calls,
    from: (table: string) => ({
      // deno-lint-ignore no-explicit-any
      update: (data: any) => { calls.push({ table, method: "update", data }); return chain; },
      // deno-lint-ignore no-explicit-any
      insert: (data: any) => { calls.push({ table, method: "insert", data }); return chain; },
      delete: () => { calls.push({ table, method: "delete" }); return chain; },
    }),
  // deno-lint-ignore no-explicit-any
  } as any;
  const agent = makeAgent();
  const osInfo: OSInfo = {};
  await executeParallelOps(sb, agent, osInfo);
  // Only token update should happen
  const tokenUpdate = calls.find((c) => c.table === "agent_tokens");
  assertExists(tokenUpdate, "Should always update agent_tokens");
  const metricsInsert = calls.find((c) => c.table === "agent_system_metrics_partitioned");
  assertEquals(metricsInsert, undefined, "Should NOT insert metrics when none provided");
});

Deno.test("state-updater-edge › executeParallelOps with process anomalies", async () => {
  const calls: MockCall[] = [];
  const chain: Record<string, unknown> = {
    eq: () => chain,
    lt: () => chain,
    then: (cb: (v: { data: null; error: null }) => void) => {
      cb({ data: null, error: null });
      return Promise.resolve();
    },
  };
  const sb = {
    calls,
    from: (table: string) => ({
      // deno-lint-ignore no-explicit-any
      update: (data: any) => { calls.push({ table, method: "update", data }); return chain; },
      // deno-lint-ignore no-explicit-any
      insert: (data: any) => { calls.push({ table, method: "insert", data }); return chain; },
      delete: () => { calls.push({ table, method: "delete" }); return chain; },
    }),
  // deno-lint-ignore no-explicit-any
  } as any;
  const agent = makeAgent();
  const osInfo: OSInfo = {
    processes: { total_processes: 3, top_by_cpu: [], top_by_memory: [] },
    process_anomalies: [{ pid: 123, name: "suspicious.exe", reason: "unknown" }],
  };
  await executeParallelOps(sb, agent, osInfo);
  const processInsert = calls.find((c) => c.table === "agent_processes");
  assertExists(processInsert, "Should insert process data");
  assertEquals(processInsert!.data.suspicious_processes.length, 1);
});
