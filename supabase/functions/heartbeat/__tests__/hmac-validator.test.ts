import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { validateHeartbeatHmac } from "../auth/hmac-validator.ts";

Deno.test("hmac › agent without HMAC headers is blocked", async () => {
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

Deno.test("hmac › legacy agent without HMAC headers is also blocked", async () => {
  const req = new Request("https://test/heartbeat", {
    method: "POST",
    body: JSON.stringify({ foo: "bar" }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await validateHeartbeatHmac({} as any, req, "agent1", "secret", "3.10.37", null);
  assertEquals(result.ok, false);
  assertExists(result.errorResponse);
  const body = await result.errorResponse!.json();
  assertEquals(body.code, "HMAC_MISSING");
  assertEquals(result.errorResponse!.status, 401);
});
