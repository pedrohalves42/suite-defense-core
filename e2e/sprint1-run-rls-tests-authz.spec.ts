/**
 * Sprint 1 — Acceptance E2E for run-rls-tests hardening
 * (FINDING-2026-06-29-RRT-PUBLIC-SERVICE-ROLE)
 *
 * Validates:
 *   1. Sem Authorization        → 401
 *   2. JWT inválido             → 401
 *   3. Usuário autenticado comum → 403
 *   4. super_admin              → 200
 *   5. CORS: origem não-allowlisted não recebe "*"
 */

import { test, expect } from "@playwright/test";
import {
  callEdgeFunction,
  getAccessToken,
  hasSecurityTestEnvVars,
} from "./helpers/security-test-helpers";

test.describe("Sprint 1 / run-rls-tests authz", () => {
  test.beforeEach(() => {
    test.skip(!hasSecurityTestEnvVars(), "Security test env not configured");
  });

  test("RRT-AUTHZ-001: sem Authorization → 401", async () => {
    const res = await callEdgeFunction({
      functionName: "run-rls-tests",
      method: "POST",
    });
    expect(res.status).toBe(401);
    await res.text();
  });

  test("RRT-AUTHZ-002: JWT inválido → 401", async () => {
    const res = await callEdgeFunction({
      functionName: "run-rls-tests",
      method: "POST",
      authToken: "obviously.invalid.jwt",
    });
    expect(res.status).toBe(401);
    await res.text();
  });

  test("RRT-AUTHZ-003: usuário autenticado comum → 403", async () => {
    const token = await getAccessToken("viewer");
    test.skip(!token, "viewer test user not seeded");
    const res = await callEdgeFunction({
      functionName: "run-rls-tests",
      method: "POST",
      authToken: token!,
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/super_admin/i);
  });

  test("RRT-AUTHZ-004: super_admin → 200", async () => {
    const token = await getAccessToken("super_admin");
    test.skip(!token, "super_admin test user not seeded");
    const res = await callEdgeFunction({
      functionName: "run-rls-tests",
      method: "POST",
      authToken: token!,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("success");
    expect(body).toHaveProperty("results");
  });

  test("RRT-AUTHZ-005: CORS não devolve '*' para origem não-allowlisted", async () => {
    const url = `${process.env.VITE_SUPABASE_URL}/functions/v1/run-rls-tests`;
    const res = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example.com",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    const allow = res.headers.get("access-control-allow-origin");
    expect(allow).not.toBe("*");
    expect(allow).not.toBe("https://evil.example.com");
    await res.text();
  });
});
