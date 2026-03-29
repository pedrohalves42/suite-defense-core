import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { parseHeartbeatPayload, buildAgentUpdate } from "../parser/heartbeat-parser.ts";
import type { OSInfo } from "../types.ts";

Deno.test("parser › empty string returns empty object", () => {
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
  const osInfo: OSInfo = { os_type: "windows", hostname: "HOST1" };
  const update = buildAgentUpdate(osInfo, null);
  assertExists(update.last_heartbeat);
  assertEquals(update.status, "active");
  assertEquals(update.os_type, "windows");
  assertEquals(update.hostname, "HOST1");
});

Deno.test("parser › buildAgentUpdate skips agent_version when unchanged", () => {
  const osInfo: OSInfo = { agent_version: "5.0.15" };
  const update = buildAgentUpdate(osInfo, "5.0.15");
  assertEquals(update.agent_version, undefined);
});

Deno.test("parser › buildAgentUpdate includes agent_version when changed", () => {
  const osInfo: OSInfo = { agent_version: "5.0.16" };
  const update = buildAgentUpdate(osInfo, "5.0.15");
  assertEquals(update.agent_version, "5.0.16");
});

Deno.test("parser › buildAgentUpdate captures ed25519 flags", () => {
  const osInfo: OSInfo = { ed25519_supported: true, signature_mode: "ed25519" };
  const update = buildAgentUpdate(osInfo, null);
  assertEquals(update.ed25519_supported, true);
  assertEquals(update.signature_mode, "ed25519");
});
