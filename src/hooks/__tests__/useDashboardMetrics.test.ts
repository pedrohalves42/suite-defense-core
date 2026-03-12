import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDashboardMetrics } from "../useDashboardMetrics";
import type { DashboardAgent, DashboardJob } from "../useDashboardData";

const makeAgent = (overrides: Partial<DashboardAgent> = {}): DashboardAgent => ({
  id: crypto.randomUUID(),
  agent_name: `agent-${Math.random().toString(36).slice(2, 6)}`,
  status: "active",
  enrolled_at: new Date().toISOString(),
  last_heartbeat: new Date().toISOString(), // online by default
  tenant_id: "tenant-1",
  ...overrides,
});

const makeJob = (overrides: Partial<DashboardJob> = {}): DashboardJob => ({
  id: crypto.randomUUID(),
  agent_name: "agent-1",
  type: "scan",
  status: "completed",
  created_at: new Date().toISOString(),
  completed_at: new Date().toISOString(),
  ...overrides,
});

const tenantNames = { "tenant-1": "Empresa A", "tenant-2": "Empresa B" };

describe("useDashboardMetrics", () => {
  it("returns 0 agents when list is empty", () => {
    const { result } = renderHook(() => useDashboardMetrics([], [], {}));
    expect(result.current.offlineCount).toBe(0);
    expect(result.current.onlinePercentage).toBe("0");
    expect(result.current.systemState).toBe("healthy");
  });

  it("calculates online agents correctly", () => {
    const agents = [makeAgent(), makeAgent(), makeAgent({ last_heartbeat: null })];
    const { result } = renderHook(() => useDashboardMetrics(agents, [], tenantNames));
    expect(result.current.offlineCount).toBe(1);
    expect(result.current.onlinePercentage).toBe("67");
  });

  it("counts failed jobs", () => {
    const jobs = [makeJob({ status: "completed" }), makeJob({ status: "failed" }), makeJob({ status: "failed" })];
    const { result } = renderHook(() => useDashboardMetrics([], jobs, {}));
    expect(result.current.failedJobs).toBe(2);
    expect(result.current.completedJobs).toBe(1);
    expect(result.current.successRate).toBe("33");
  });

  it("returns 100% success rate when no completed or failed jobs", () => {
    const jobs = [makeJob({ status: "queued" })];
    const { result } = renderHook(() => useDashboardMetrics([], jobs, {}));
    expect(result.current.successRate).toBe("100");
  });

  it("detects critical system state", () => {
    const agents = Array.from({ length: 5 }, () => makeAgent({ last_heartbeat: null }));
    const jobs = Array.from({ length: 6 }, () => makeJob({ status: "failed" }));
    const { result } = renderHook(() => useDashboardMetrics(agents, jobs, {}));
    expect(result.current.systemState).toBe("critical");
  });

  it("detects warning system state", () => {
    const agents = [makeAgent({ last_heartbeat: "2020-01-01T00:00:00Z" })];
    const jobs = [makeJob({ status: "failed" })];
    const { result } = renderHook(() => useDashboardMetrics(agents, jobs, {}));
    expect(result.current.systemState).toBe("warning");
  });

  it("groups tenants by severity correctly", () => {
    const agents = [
      makeAgent({ tenant_id: "tenant-1" }),
      makeAgent({ tenant_id: "tenant-1", last_heartbeat: null }),
      makeAgent({ tenant_id: "tenant-2" }),
    ];
    const { result } = renderHook(() => useDashboardMetrics(agents, [], tenantNames));
    expect(result.current.sortedTenantsByGravity.length).toBe(2);
    // tenant-1 has 1 offline → warning, should come first
    expect(result.current.sortedTenantsByGravity[0].tenantId).toBe("tenant-1");
    expect(result.current.sortedTenantsByGravity[0].severity).toBe("warning");
    expect(result.current.sortedTenantsByGravity[1].severity).toBe("healthy");
  });

  it("counts alerts for agents without heartbeat", () => {
    const agents = [makeAgent({ last_heartbeat: null }), makeAgent()];
    const { result } = renderHook(() => useDashboardMetrics(agents, [], {}));
    expect(result.current.alerts).toBe(1);
  });

  it("counts alerts for agents with old heartbeat", () => {
    const oldDate = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10min ago
    const agents = [makeAgent({ last_heartbeat: oldDate })];
    const { result } = renderHook(() => useDashboardMetrics(agents, [], {}));
    expect(result.current.alerts).toBe(1);
  });

  it("uses tenant names in tenantStats", () => {
    const agents = [makeAgent({ tenant_id: "tenant-1" })];
    const { result } = renderHook(() => useDashboardMetrics(agents, [], tenantNames));
    expect(result.current.sortedTenantsByGravity[0].name).toBe("Empresa A");
  });
});
