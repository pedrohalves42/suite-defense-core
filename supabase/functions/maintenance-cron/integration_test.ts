/**
 * Integration Tests: Hexagonal Use Cases (Deno)
 * 
 * Tests the ProcessHeartbeatUseCase and RunMaintenanceUseCase
 * using mock Supabase clients.
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { ProcessHeartbeatUseCase } from "../_shared/hexagonal/use-cases/process-heartbeat.ts";
import { RunMaintenanceUseCase } from "../_shared/hexagonal/use-cases/run-maintenance.ts";
import { UpdateDecisionService, normalizeVersion, calculateSha256 } from "../_shared/hexagonal/update-decision-service.ts";

// ─── Mock Supabase Client ──────────────────────────────

function createMockSupabase(overrides: Record<string, any> = {}) {
  const defaultData: Record<string, any> = {
    agents: [],
    agent_system_metrics: [],
    agent_releases: [],
    jobs: [],
    job_executions: [],
    ...overrides,
  };

  // Chainable mock builder
  const chainable = (data: any = null, list: any[] = []) => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      lt: () => chain,
      is: () => chain,
      order: () => chain,
      limit: () => Promise.resolve({ data: list, error: null }),
      single: () => Promise.resolve({ data, error: null }),
      maybeSingle: () => Promise.resolve({ data, error: null }),
    };
    return chain;
  };

  return {
    from(table: string) {
      const tableData = defaultData[table] || [];
      return {
        select: (_cols?: string) => chainable(tableData[0] || null, tableData),
        update: (_data: any) => ({
          eq: () => Promise.resolve({ error: null }),
          in: () => Promise.resolve({ error: null }),
        }),
        insert: (_data: any) => Promise.resolve({ error: null }),
        upsert: (_data: any) => Promise.resolve({ error: null }),
      };
    },
    rpc(_fn: string, _params: Record<string, unknown>) {
      return Promise.resolve({ data: null, error: null });
    },
  };
}

// ─── UpdateDecisionService Tests ───────────────────────

Deno.test("UpdateDecisionService - normalizeVersion strips 'v' prefix", () => {
  assertEquals(normalizeVersion("v5.0.3"), "5.0.3");
  assertEquals(normalizeVersion("v5.0.3-hotfix"), "5.0.3");
  assertEquals(normalizeVersion("5.0.3"), "5.0.3");
  assertEquals(normalizeVersion(null), "");
  assertEquals(normalizeVersion(undefined), "");
});

Deno.test("UpdateDecisionService - upgrade when versions differ", async () => {
  const service = new UpdateDecisionService();
  const decision = await service.evaluate(
    { agentId: "a1", agentName: "test", currentVersion: "v5.0.2", platform: "windows" },
    { version: "v5.0.3", scriptContent: "# script", sha256: "abc", releaseNotes: null }
  );
  assertEquals(decision.action, "upgrade");
});

Deno.test("UpdateDecisionService - no_update when versions match and no SHA256", async () => {
  const service = new UpdateDecisionService();
  const decision = await service.evaluate(
    { agentId: "a1", agentName: "test", currentVersion: "v5.0.3", platform: "windows" },
    { version: "v5.0.3", scriptContent: "# script", sha256: "abc", releaseNotes: null, createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() }
  );
  assertEquals(decision.action, "no_update");
});

Deno.test("UpdateDecisionService - hotfix when SHA256 differs on same version", async () => {
  const service = new UpdateDecisionService();
  const sha = await calculateSha256("# different script");
  const decision = await service.evaluate(
    { agentId: "a1", agentName: "test", currentVersion: "v5.0.3", currentScriptSha256: "aaaa", platform: "windows" },
    { version: "v5.0.3", scriptContent: "# different script", sha256: sha, releaseNotes: null }
  );
  assertEquals(decision.action, "hotfix");
});

Deno.test("UpdateDecisionService - force legacy delivery bypasses checks", async () => {
  const service = new UpdateDecisionService();
  const decision = await service.evaluate(
    { agentId: "a1", agentName: "test", currentVersion: "v5.0.3", platform: "windows" },
    { version: "v5.0.3", scriptContent: "# script", sha256: "abc", releaseNotes: null },
    { forceLegacyDelivery: true }
  );
  assertEquals(decision.action, "upgrade");
});

// ─── ProcessHeartbeatUseCase Tests ──────────────────────

Deno.test("ProcessHeartbeat - returns ok with agent name", async () => {
  const mockSupabase = createMockSupabase();
  const useCase = new ProcessHeartbeatUseCase(mockSupabase as any);

  const result = await useCase.execute({
    agentId: "agent-1",
    agentName: "test-agent",
    tenantId: "tenant-1",
    agentVersion: "v5.0.3",
  });

  assertEquals(result.ok, true);
  assertEquals(result.agentName, "test-agent");
  assertExists(result.timestamp);
});

// ─── RunMaintenanceUseCase Tests ────────────────────────

Deno.test("RunMaintenance - returns result with all counters", async () => {
  const mockSupabase = createMockSupabase();
  const useCase = new RunMaintenanceUseCase(mockSupabase as any);

  const result = await useCase.execute();

  assertEquals(result.expiredJobsProcessed, 0);
  assertEquals(result.offlineAgentsProcessed, 0);
  assertEquals(result.archivedExecutions, 0);
  assertEquals(typeof result.durationMs, "number");
});

// ─── SHA256 Calculation Tests ───────────────────────────

Deno.test("calculateSha256 produces consistent hex string", async () => {
  const hash1 = await calculateSha256("hello world");
  const hash2 = await calculateSha256("hello world");
  assertEquals(hash1, hash2);
  assertEquals(hash1.length, 64); // SHA256 = 64 hex chars
});

Deno.test("calculateSha256 normalizes CRLF", async () => {
  const hash1 = await calculateSha256("line1\nline2");
  const hash2 = await calculateSha256("line1\r\nline2");
  assertEquals(hash1, hash2); // Both should normalize to CRLF
});
