import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { updateAgentStatus, executeParallelOps } from "../state-updater.ts";
import type { AgentContext, AgentUpdate, OSInfo } from "../types.ts";

interface MockCall {
  table: string;
  method: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

function mockSupabase() {
  const calls: MockCall[] = [];
  const chain = {
    eq: () => chain,
    lt: () => chain,
    then: (cb: (v: { data: null; error: null }) => void) => {
      cb({ data: null, error: null });
      return Promise.resolve();
    },
  };
  return {
    calls,
    from: (table: string) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: (data: any) => { calls.push({ table, method: "update", data }); return chain; },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      insert: (data: any) => { calls.push({ table, method: "insert", data }); return chain; },
      delete: () => { calls.push({ table, method: "delete" }); return chain; },
    }),
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

Deno.test("state-updater › updateAgentStatus calls agents.update", async () => {
  const sb = mockSupabase();
  const update: AgentUpdate = { last_heartbeat: new Date().toISOString(), status: "active" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await updateAgentStatus(sb as any, "agent-id-1", "agent1", update);
  const call = sb.calls.find((c) => c.table === "agents" && c.method === "update");
  assertExists(call, "agents.update should be called");
});

Deno.test("state-updater › executeParallelOps inserts metrics and processes", async () => {
  const sb = mockSupabase();
  const agent = makeAgent();
  const osInfo: OSInfo = {
    system_metrics: { cpu_percent: 10, memory_total_gb: 16, memory_used_gb: 8 },
    processes: { total_processes: 5, top_by_cpu: [], top_by_memory: [] },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await executeParallelOps(sb as any, agent, osInfo);
  const metricsInsert = sb.calls.find((c) => c.table === "agent_system_metrics_partitioned");
  assertExists(metricsInsert, "Should insert system metrics");
  const processInsert = sb.calls.find((c) => c.table === "agent_processes");
  assertExists(processInsert, "Should insert process data");
});

Deno.test("state-updater › executeParallelOps skips metrics when payload has error", async () => {
  const sb = mockSupabase();
  const agent = makeAgent();
  const osInfo: OSInfo = { system_metrics: { error: "WMI failure" } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await executeParallelOps(sb as any, agent, osInfo);
  const metricsInsert = sb.calls.find((c) => c.table === "agent_system_metrics_partitioned");
  assertEquals(metricsInsert, undefined, "Should NOT insert metrics when error present");
});
