/**
 * Unit tests for heartbeat modular components.
 * Tests parser, HMAC validator logic, state-updater, and response-builder
 * using mocks — no live DB needed.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ─── Parser tests ────────────────────────────────────────────

import { parseHeartbeatPayload, buildAgentUpdate } from "../../heartbeat/parser/heartbeat-parser.ts";

Deno.test("parser › empty body returns empty OSInfo", () => {
  const result = parseHeartbeatPayload("");
  assertEquals(typeof result, "object");
});

Deno.test("parser › invalid JSON returns empty OSInfo", () => {
  const result = parseHeartbeatPayload("not json at all");
  assertEquals(typeof result, "object");
});

Deno.test("parser › valid payload extracts os_type and hostname", () => {
  const payload = JSON.stringify({
    os_type: "windows",
    os_version: "10.0.19045",
    hostname: "PC-TEST-01",
    agent_version: "5.0.15",
  });
  const result = parseHeartbeatPayload(payload);
  assertEquals(result.os_type, "windows");
  assertEquals(result.hostname, "PC-TEST-01");
  assertEquals(result.agent_version, "5.0.15");
});

Deno.test("parser › legacy platform field accepted", () => {
  const payload = JSON.stringify({ platform: "linux" });
  const result = parseHeartbeatPayload(payload);
  assertEquals(result.platform, "linux");
});

Deno.test("parser › buildAgentUpdate sets last_heartbeat and status", () => {
  const osInfo = { os_type: "windows", hostname: "HOST1" };
  const update = buildAgentUpdate(osInfo, null);
  assertExists(update.last_heartbeat);
  assertEquals(update.status, "active");
  assertEquals(update.os_type, "windows");
  assertEquals(update.hostname, "HOST1");
});

Deno.test("parser › buildAgentUpdate skips agent_version when unchanged", () => {
  const osInfo = { agent_version: "5.0.15" };
  const update = buildAgentUpdate(osInfo, "5.0.15");
  assertEquals(update.agent_version, undefined);
});

Deno.test("parser › buildAgentUpdate includes agent_version when changed", () => {
  const osInfo = { agent_version: "5.0.16" };
  const update = buildAgentUpdate(osInfo, "5.0.15");
  assertEquals(update.agent_version, "5.0.16");
});

Deno.test("parser › buildAgentUpdate captures ed25519 flags", () => {
  const osInfo = { ed25519_supported: true, signature_mode: "ed25519" };
  const update = buildAgentUpdate(osInfo, null);
  assertEquals(update.ed25519_supported, true);
  assertEquals(update.signature_mode, "ed25519");
});

// ─── HMAC Validator tests ────────────────────────────────────

import { isModernAgent } from "../../heartbeat/auth/hmac-validator.ts";

Deno.test("hmac › isModernAgent returns false for legacy version", () => {
  assertEquals(isModernAgent("5.0.11"), false);
});

Deno.test("hmac › isModernAgent returns true for 5.0.12", () => {
  assertEquals(isModernAgent("5.0.12"), true);
});

Deno.test("hmac › isModernAgent returns true for newer version", () => {
  assertEquals(isModernAgent("5.1.0"), true);
});

Deno.test("hmac › isModernAgent returns false for null (legacy)", () => {
  assertEquals(isModernAgent(null), false);
});

Deno.test("hmac › isModernAgent returns false for empty string", () => {
  assertEquals(isModernAgent(""), false);
});

// ─── State Updater tests (with mock) ────────────────────────

import { updateAgentStatus, executeParallelOps } from "../../heartbeat/state-updater.ts";

function mockSupabase(overrides: Record<string, unknown> = {}) {
  const calls: Array<{ table: string; method: string; data?: unknown }> = [];
  const chainable = {
    eq: () => chainable,
    lt: () => chainable,
    then: (cb: (v: unknown) => void) => { cb({ data: null, error: null }); return Promise.resolve(); },
  };
  return {
    calls,
    from: (table: string) => ({
      update: (data: unknown) => { calls.push({ table, method: "update", data }); return chainable; },
      insert: (data: unknown) => { calls.push({ table, method: "insert", data }); return chainable; },
      delete: () => { calls.push({ table, method: "delete" }); return chainable; },
    }),
  } as any;
}

Deno.test("state-updater › updateAgentStatus calls agents.update", async () => {
  const sb = mockSupabase();
  await updateAgentStatus(sb, "agent-id-1", "agent1", {
    last_heartbeat: new Date().toISOString(),
    status: "active",
  });
  const agentCall = sb.calls.find((c: any) => c.table === "agents" && c.method === "update");
  assertExists(agentCall, "Should have called agents.update");
});

Deno.test("state-updater › executeParallelOps inserts metrics when present", async () => {
  const sb = mockSupabase();
  const agent = { id: "a1", agent_name: "test", tenant_id: "t1", hmac_secret: "s", status: "active", skip_firewall_remediation: false, agent_version: null, force_update_version: null, force_update_reason: null, force_update_at: null, force_update_override_safe_mode: false, force_update_override_safe_mode_expires_at: null, force_update_delivered_count: 0, force_update_first_delivered_at: null, last_forced_update_applied: null };
  const osInfo = {
    system_metrics: { cpu_percent: 10, memory_total_gb: 16, memory_used_gb: 8 },
    processes: { total_processes: 5, top_by_cpu: [], top_by_memory: [] },
  };
  await executeParallelOps(sb, agent, osInfo);
  const metricsInsert = sb.calls.find((c: any) => c.table === "agent_system_metrics_partitioned");
  assertExists(metricsInsert, "Should insert system metrics");
  const processInsert = sb.calls.find((c: any) => c.table === "agent_processes");
  assertExists(processInsert, "Should insert process data");
});

Deno.test("state-updater › executeParallelOps skips metrics on error field", async () => {
  const sb = mockSupabase();
  const agent = { id: "a1", agent_name: "test", tenant_id: "t1", hmac_secret: "s", status: "active", skip_firewall_remediation: false, agent_version: null, force_update_version: null, force_update_reason: null, force_update_at: null, force_update_override_safe_mode: false, force_update_override_safe_mode_expires_at: null, force_update_delivered_count: 0, force_update_first_delivered_at: null, last_forced_update_applied: null };
  const osInfo = {
    system_metrics: { error: "WMI failed" },
  };
  await executeParallelOps(sb, agent, osInfo);
  const metricsInsert = sb.calls.find((c: any) => c.table === "agent_system_metrics_partitioned");
  assertEquals(metricsInsert, undefined, "Should NOT insert metrics when error field is present");
});
