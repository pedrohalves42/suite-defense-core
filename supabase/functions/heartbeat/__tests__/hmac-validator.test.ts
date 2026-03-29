import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { isModernAgent, validateHeartbeatHmac } from "../auth/hmac-validator.ts";

Deno.test("hmac › isModernAgent returns false for legacy version", () => {
  assertEquals(isModernAgent("5.0.11"), false);
});

Deno.test("hmac › isModernAgent returns true for 5.0.12", () => {
  assertEquals(isModernAgent("5.0.12"), true);
});

Deno.test("hmac › isModernAgent returns true for newer version", () => {
  assertEquals(isModernAgent("5.1.0"), true);
});

Deno.test("hmac › isModernAgent returns false for null", () => {
  assertEquals(isModernAgent(null), false);
});

Deno.test("hmac › isModernAgent returns false for empty string", () => {
  assertEquals(isModernAgent(""), false);
});

Deno.test("hmac › modern agent without HMAC headers is blocked", async () => {
  const req = new Request("https://test/heartbeat", {
    method: "POST",
    body: JSON.stringify({ foo: "bar" }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await validateHeartbeatHmac({} as any, req, "agent1", "secret", "5.1.0", null);
  assertEquals(result.ok, false);
  assertExists(result.errorResponse);
  const body = await result.errorResponse!.json();
  assertEquals(body.code, "HMAC_MISSING");
  assertEquals(result.errorResponse!.status, 401);
});
