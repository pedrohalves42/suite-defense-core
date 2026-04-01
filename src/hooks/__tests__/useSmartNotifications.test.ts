import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockRpc = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({
    tenant: { id: 'tenant-abc' },
    loading: false,
  }),
}));

import { useSmartNotifications } from '../useSmartNotifications';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useSmartNotifications', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array when RPC returns empty', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useSmartNotifications(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.notifications).toEqual([]);
  });

  it('returns notifications from RPC array response', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { type: 'warning', title: 'Alert', message: 'Test', urgency: 'high' },
      ],
      error: null,
    });
    const { result } = renderHook(() => useSmartNotifications(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(result.current.notifications[0].type).toBe('warning');
  });

  it('calls RPC with correct tenant_id', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    renderHook(() => useSmartNotifications(), { wrapper: createWrapper() });
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    expect(mockRpc).toHaveBeenCalledWith('get_smart_notifications', { p_tenant_id: 'tenant-abc' });
  });

  it('returns empty array on error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'fail' } });
    const { result } = renderHook(() => useSmartNotifications(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.notifications).toEqual([]);
  });
});
