import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockInvoke = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
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

import { useActionCenter, useActionCenterCount } from '../useActionCenter';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useActionCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({
      data: {
        urgent: [{ item_id: '1', title: 'Urgent', severity: 'critical', source_type: 'alert', priority_score: 100, created_at: new Date().toISOString() }],
        recommended: [],
        informational: [],
        healthy_count: 5,
        offline_count: 1,
        total_agents: 6,
        generated_at: new Date().toISOString(),
      },
      error: null,
    });
  });

  it('fetches action center feed', async () => {
    const { result } = renderHook(() => useActionCenter(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.urgent).toHaveLength(1);
    expect(result.current.data?.total_agents).toBe(6);
  });

  it('calls action-center-feed with tenant header', async () => {
    renderHook(() => useActionCenter(), { wrapper: createWrapper() });
    await waitFor(() => expect(mockInvoke).toHaveBeenCalled());
    expect(mockInvoke).toHaveBeenCalledWith('action-center-feed', expect.objectContaining({
      headers: expect.objectContaining({ 'x-tenant-id': 'tenant-abc' }),
    }));
  });
});

describe('useActionCenterCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({
      data: {
        urgent: [{ item_id: '1' }, { item_id: '2' }],
        recommended: [{ item_id: '3' }],
        informational: [],
        healthy_count: 5,
        offline_count: 0,
        total_agents: 5,
        generated_at: new Date().toISOString(),
      },
      error: null,
    });
  });

  it('counts urgent and recommended items', async () => {
    const { result } = renderHook(() => useActionCenterCount(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.totalCount).toBeGreaterThan(0));
    expect(result.current.urgentCount).toBe(2);
    expect(result.current.recommendedCount).toBe(1);
    expect(result.current.totalCount).toBe(3);
  });
});
