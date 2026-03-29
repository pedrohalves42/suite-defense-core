/**
 * Extended parser tests — edge cases, error handling, and backwards compatibility.
 */
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseHeartbeatPayload, buildAgentUpdate } from "../parser/heartbeat-parser.ts";

// ═══ parseHeartbeatPayload edge cases ═══

Deno.test("parser-edge › whitespace-only body returns empty object", () => {
  const result = parseHeartbeatPayload("   \n\t  ");
  assertEquals(Object.keys(result).length, 0);
});

Deno.test("parser-edge › numeric JSON returns empty object", () => {
  const result = parseHeartbeatPayload("42");
  assertEquals(typeof result, "object");
});

Deno.test("parser-edge › array JSON returns empty object", () => {
  const result = parseHeartbeatPayload("[1,2,3]");
  assertEquals(typeof result, "object");
});

Deno.test("parser-edge › null JSON returns empty object", () => {
  const result = parseHeartbeatPayload("null");
  assertEquals(typeof result, "object");
});

Deno.test("parser-edge › deeply nested payload is accepted", () => {
  const payload = JSON.stringify({
    os_type: "windows",
    system_metrics: {
      cpu_percent: 55,
      memory_total_gb: 32,
      memory_used_gb: 24,
      disk_total_gb: 500,
      disk_free_gb: 100,
    },
    processes: {
      total_processes: 200,
      top_by_cpu: [{ pid: 1, name: "chrome", cpu_seconds: 10, memory_mb: 500 }],
      top_by_memory: [],
    },
  });
  const result = parseHeartbeatPayload(payload);
  assertEquals(result.os_type, "windows");
  assertExists(result.system_metrics);
  assertEquals(result.system_metrics!.cpu_percent, 55);
});

// ═══ buildAgentUpdate edge cases ═══

Deno.test("parser-edge › buildAgentUpdate with platform fallback", () => {
  const update = buildAgentUpdate({ platform: "linux" }, null);
  assertEquals(update.os_type, "linux");
});

Deno.test("parser-edge › buildAgentUpdate prefers os_type over platform", () => {
  const update = buildAgentUpdate({ os_type: "windows", platform: "linux" }, null);
  assertEquals(update.os_type, "windows");
});

Deno.test("parser-edge › buildAgentUpdate with empty osInfo", () => {
  const update = buildAgentUpdate({}, null);
  assertExists(update.last_heartbeat);
  assertEquals(update.status, "active");
  assertEquals(update.os_type, undefined);
  assertEquals(update.hostname, undefined);
  assertEquals(update.agent_version, undefined);
});

Deno.test("parser-edge › buildAgentUpdate agent_version from null to new", () => {
  const update = buildAgentUpdate({ agent_version: "5.0.15" }, null);
  assertEquals(update.agent_version, "5.0.15");
});

Deno.test("parser-edge › buildAgentUpdate ed25519_supported false is captured", () => {
  const update = buildAgentUpdate({ ed25519_supported: false }, null);
  assertEquals(update.ed25519_supported, false);
});

Deno.test("parser-edge › buildAgentUpdate version with v prefix handled", () => {
  // normalizeVersion strips v prefix, so v5.0.15 === 5.0.15
  const update = buildAgentUpdate({ agent_version: "v5.0.15" }, "5.0.15");
  // versions are equal after normalization, so agent_version should NOT be set
  assertEquals(update.agent_version, undefined);
});
