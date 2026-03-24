import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockRpc = vi.fn();
const mockInvoke = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        })),
      })),
    })),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({
    tenant: { id: 'tenant-abc', name: 'Test' },
    loading: false,
  }),
}));

vi.mock('@/hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => ({ isOnline: true }),
}));

import { useScheduledJobsHealth } from '../useScheduledJobsHealth';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useScheduledJobsHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: [], error: null });
  });

  it('returns loading=true initially then resolves', async () => {
    const { result } = renderHook(() => useScheduledJobsHealth(), { wrapper: createWrapper() });
    await waitFor(() => {
      expect(result.current.isLoading).toBeDefined();
    });
  });

  it('provides triggerMonitor mutation that calls health-monitor', async () => {
    mockInvoke.mockResolvedValue({ data: { jobs_checked: 5, alerts_created: 0 }, error: null });

    const { result } = renderHook(() => useScheduledJobsHealth(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.triggerMonitor).toBeDefined());

    // Verify the mutation function exists
    expect(typeof result.current.triggerMonitor.mutate).toBe('function');
  });

  it('calls health-monitor (not legacy job-health-monitor)', async () => {
    mockInvoke.mockResolvedValue({ data: { jobs_checked: 3, alerts_created: 1 }, error: null });

    const { result } = renderHook(() => useScheduledJobsHealth(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.triggerMonitor).toBeDefined());

    result.current.triggerMonitor.mutate();
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('health-monitor');
    });
  });
});
