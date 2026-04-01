import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn().mockResolvedValue({
            data: [
              { id: '1', severity: 'critical', risk_status: 'expiring_soon' },
              { id: '2', severity: 'high', risk_status: 'active' },
              { id: '3', severity: 'medium', risk_status: 'active' },
            ],
            error: null,
          }),
        })),
      })),
    })),
  },
}));

vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({
    tenant: { id: 'tenant-abc' },
    loading: false,
  }),
}));

import { useRiskDebtSummary } from '../useRiskDebt';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useRiskDebtSummary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calculates summary correctly', async () => {
    const { result } = renderHook(() => useRiskDebtSummary(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.summary.total).toBe(3);
    expect(result.current.summary.expiringSoon).toBe(1);
    expect(result.current.summary.bySeverity.critical).toBe(1);
    expect(result.current.summary.bySeverity.high).toBe(1);
    expect(result.current.summary.bySeverity.medium).toBe(1);
    expect(result.current.summary.bySeverity.low).toBe(0);
  });
});
