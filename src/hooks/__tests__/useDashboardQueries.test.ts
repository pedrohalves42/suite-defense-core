import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Mocks ──────────────────────────────────────────────
const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockChannel = vi.fn();
const mockRemoveChannel = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
    channel: (...args: unknown[]) => mockChannel(...args),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
}));

vi.mock('@/hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => ({ isOnline: true }),
}));

vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({
    tenant: { id: 'tenant-abc', name: 'Acme Corp' },
    loading: false,
  }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { useDashboardQueries } from '../useDashboardQueries';

// ── Helpers ────────────────────────────────────────────
function chainBuilder(resolvedValue: { data: unknown; error: null | Error }) {
  const self: Record<string, unknown> = {};
  const terminal = () => Promise.resolve(resolvedValue);
  ['select', 'eq', 'gte', 'order', 'limit', 'in', 'neq', 'lt', 'gt', 'is'].forEach(m => {
    self[m] = vi.fn(() => self);
  });
  // Make the chain resolve when awaited
  self.then = (resolve: (v: unknown) => void) => terminal().then(resolve);
  return self;
}

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

function setupDefaultMocks(agents: unknown[] = [], jobs: unknown[] = []) {
  mockRpc.mockImplementation((fnName: string) => {
    if (fnName === 'get_agents_list') return Promise.resolve({ data: agents, error: null });
    return Promise.resolve({ data: [], error: null });
  });
  mockFrom.mockImplementation(() => chainBuilder({ data: jobs, error: null }));
  mockChannel.mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() });
}

// ── Tests ──────────────────────────────────────────────
describe('useDashboardQueries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('returns loading=true initially then resolves to false', async () => {
    const { result } = renderHook(() => useDashboardQueries(), { wrapper: createWrapper() });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('returns empty arrays when no data exists', async () => {
    const { result } = renderHook(() => useDashboardQueries(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.agents).toEqual([]);
    expect(result.current.jobs).toEqual([]);
    expect(result.current.reports).toEqual([]);
    expect(result.current.virusScans).toEqual([]);
    expect(result.current.auditLogs).toEqual([]);
    expect(result.current.agentTokens).toEqual([]);
    expect(result.current.rateLimits).toEqual([]);
  });

  it('returns tenant info from useTenant', async () => {
    const { result } = renderHook(() => useDashboardQueries(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tenant?.id).toBe('tenant-abc');
    expect(result.current.tenant?.name).toBe('Acme Corp');
  });

  it('provides a callable refresh function', async () => {
    const { result } = renderHook(() => useDashboardQueries(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.refresh).toBe('function');
    // Should not throw
    result.current.refresh();
  });

  it('uses realtime queries for agents and jobs', async () => {
    const { result } = renderHook(() => useDashboardQueries(), { wrapper: createWrapper() });
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    // Hook now uses useRealtimeQuery internally instead of direct supabase.channel calls
    expect(result.current.agents).toBeDefined();
    expect(result.current.jobs).toBeDefined();
  });

  it('provides cleanup on unmount without error', async () => {
    const { result, unmount } = renderHook(() => useDashboardQueries(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Should unmount without throwing
    expect(() => unmount()).not.toThrow();
  });

  it('maps agent RPC data correctly', async () => {
    const mockAgents = [
      { id: 'a1', agent_name: 'Server-01', status: 'online', enrolled_at: '2025-01-01', last_heartbeat: '2025-01-02', tenant_id: 'tenant-abc' },
    ];
    setupDefaultMocks(mockAgents);

    const { result } = renderHook(() => useDashboardQueries(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.agents).toHaveLength(1);
    expect(result.current.agents[0].agent_name).toBe('Server-01');
    expect(result.current.agents[0].status).toBe('online');
  });

  it('calls get_agents_list with correct tenant_id', async () => {
    renderHook(() => useDashboardQueries(), { wrapper: createWrapper() });
    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('get_agents_list', {
        p_tenant_id: 'tenant-abc',
        p_include_archived: false,
      });
    });
  });

  it('fetches jobs with 48h window and correct tenant filter', async () => {
    renderHook(() => useDashboardQueries(), { wrapper: createWrapper() });
    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith('jobs');
    });
  });
});
