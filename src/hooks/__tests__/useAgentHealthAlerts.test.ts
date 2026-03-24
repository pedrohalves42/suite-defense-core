import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock useTenant
const mockTenant = { id: 'tenant-abc', name: 'Test Corp' };
vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({ tenant: mockTenant, loading: false }),
}));

// Mock toast
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Mock supabase
const mockSelect = vi.fn().mockReturnThis();
const mockEq = vi.fn().mockReturnThis();
const mockNeq = vi.fn().mockReturnThis();
const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null });
const mockLimit = vi.fn().mockResolvedValue({ data: [], error: null });
const mockUpdate = vi.fn().mockReturnThis();
const mockMatch = vi.fn().mockResolvedValue({ data: [], error: null });
const mockInsert = vi.fn().mockResolvedValue({ data: [{ id: '1' }], error: null });

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect,
      eq: mockEq,
      neq: mockNeq,
      order: mockOrder,
      limit: mockLimit,
      update: mockUpdate,
      match: mockMatch,
      insert: mockInsert,
    })),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
    },
  },
}));

import {
  useAgentExecutionHealth,
  useUnhealthyAgents,
  useNonExecutionAlerts,
} from '../useAgentHealthAlerts';

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useAgentExecutionHealth', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array initially then resolves', async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null });
    const { result } = renderHook(() => useAgentExecutionHealth(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('filters by tenant_id', async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null });
    renderHook(() => useAgentExecutionHealth(), { wrapper: createWrapper() });
    await waitFor(() => expect(mockEq).toHaveBeenCalledWith('tenant_id', 'tenant-abc'));
  });

  it('handles error gracefully', async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } });
    const { result } = renderHook(() => useAgentExecutionHealth(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useUnhealthyAgents', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters by unhealthy status', async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null });
    renderHook(() => useUnhealthyAgents(), { wrapper: createWrapper() });
    await waitFor(() => {
      expect(mockNeq).toHaveBeenCalledWith('health_status', 'healthy');
    });
  });
});

describe('useNonExecutionAlerts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries system_alerts with correct filters', async () => {
    renderHook(() => useNonExecutionAlerts(), { wrapper: createWrapper() });
    await waitFor(() => {
      expect(mockEq).toHaveBeenCalledWith('alert_type', 'non_execution_detected');
      expect(mockEq).toHaveBeenCalledWith('resolved', false);
    });
  });

  it('filters by tenant and unresolved', async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null });
    renderHook(() => useNonExecutionAlerts(), { wrapper: createWrapper() });
    await waitFor(() => {
      expect(mockEq).toHaveBeenCalledWith('tenant_id', 'tenant-abc');
      expect(mockEq).toHaveBeenCalledWith('resolved', false);
    });
  });
});
