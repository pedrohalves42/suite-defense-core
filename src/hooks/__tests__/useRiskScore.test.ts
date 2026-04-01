import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              })),
            })),
            gte: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        })),
      })),
    })),
    functions: { invoke: vi.fn().mockResolvedValue({ data: {}, error: null }) },
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

import { useRiskScore } from '../useRiskScore';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useRiskScore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns loading state initially', () => {
    const { result } = renderHook(() => useRiskScore(), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBeDefined();
  });

  it('exposes helper functions', () => {
    const { result } = renderHook(() => useRiskScore(), { wrapper: createWrapper() });
    expect(typeof result.current.getScoreColor).toBe('function');
    expect(typeof result.current.getScoreStatus).toBe('function');
    expect(typeof result.current.getTrendInfo).toBe('function');
    expect(typeof result.current.recalculate).toBe('function');
  });

  it('getScoreColor returns correct classes', () => {
    const { result } = renderHook(() => useRiskScore(), { wrapper: createWrapper() });
    expect(result.current.getScoreColor(90)).toBe('text-success');
    expect(result.current.getScoreColor(70)).toBe('text-warning');
    expect(result.current.getScoreColor(20)).toBe('text-destructive');
  });

  it('getScoreStatus returns correct status', () => {
    const { result } = renderHook(() => useRiskScore(), { wrapper: createWrapper() });
    expect(result.current.getScoreStatus(95).label).toBe('Excelente');
    expect(result.current.getScoreStatus(75).label).toBe('Bom');
    expect(result.current.getScoreStatus(55).label).toBe('Adequado');
    expect(result.current.getScoreStatus(35).label).toBe('Atenção');
    expect(result.current.getScoreStatus(10).label).toBe('Crítico');
  });

  it('getTrendInfo returns correct icons', () => {
    const { result } = renderHook(() => useRiskScore(), { wrapper: createWrapper() });
    expect(result.current.getTrendInfo('up').icon).toBe('↑');
    expect(result.current.getTrendInfo('down').icon).toBe('↓');
    expect(result.current.getTrendInfo('stable').icon).toBe('→');
    expect(result.current.getTrendInfo(null).icon).toBe('→');
  });
});
