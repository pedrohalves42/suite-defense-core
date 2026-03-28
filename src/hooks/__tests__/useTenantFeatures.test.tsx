import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { waitFor } from '@testing-library/dom';
import { useTenantFeatures } from '../useTenantFeatures';
import { supabase } from '@/integrations/supabase/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock useActiveTenant (used by useTenant which useTenantFeatures depends on)
vi.mock('../useActiveTenant', () => ({
  useActiveTenant: vi.fn(),
}));

import { useActiveTenant } from '../useActiveTenant';

const mockFeatures = [
  { id: '1', tenant_id: 'tenant-123', feature_key: 'ai_analysis', enabled: true, quota_limit: 100, quota_used: 50, metadata: {} },
  { id: '2', tenant_id: 'tenant-123', feature_key: 'advanced_scans', enabled: true, quota_limit: null, quota_used: 0, metadata: {} },
  { id: '3', tenant_id: 'tenant-123', feature_key: 'disabled_feature', enabled: false, quota_limit: 10, quota_used: 0, metadata: {} },
  { id: '4', tenant_id: 'tenant-123', feature_key: 'near_quota', enabled: true, quota_limit: 100, quota_used: 95, metadata: {} },
  { id: '5', tenant_id: 'tenant-123', feature_key: 'over_quota', enabled: true, quota_limit: 100, quota_used: 100, metadata: {} },
];

const setupMocks = () => {
  const mockTenant = { id: 'tenant-123', name: 'Test' };
  vi.mocked(useActiveTenant).mockReturnValue({
    activeTenant: mockTenant,
    activeRole: 'admin',
    loading: false,
    tenants: [mockTenant],
    setActiveTenantById: vi.fn(),
    isSyncing: false,
  } as unknown);

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'tenant_features') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: mockFeatures, error: null }),
        }),
      } as unknown;
    }
    return {} as unknown;
  });
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useTenantFeatures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch tenant features', async () => {
    setupMocks();
    const { result } = renderHook(() => useTenantFeatures(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.features).toEqual(mockFeatures);
    });
  });

  it('hasFeature should return true for enabled feature', async () => {
    setupMocks();
    const { result } = renderHook(() => useTenantFeatures(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.hasFeature('ai_analysis')).toBe(true);
    });
  });

  it('hasFeature should return false for disabled feature', async () => {
    setupMocks();
    const { result } = renderHook(() => useTenantFeatures(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.hasFeature('disabled_feature')).toBe(false);
    });
  });

  it('hasFeature should return false for non-existent feature', async () => {
    setupMocks();
    const { result } = renderHook(() => useTenantFeatures(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.features).toBeDefined();
      expect(result.current.features.length).toBeGreaterThan(0);
    });

    expect(result.current.hasFeature('non_existent')).toBe(false);
  });

  it('getFeatureQuota should return correct quota info', async () => {
    setupMocks();
    const { result } = renderHook(() => useTenantFeatures(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.features.length).toBeGreaterThan(0);
    });

    const quota = result.current.getFeatureQuota('ai_analysis');
    expect(quota).toEqual({ limit: 100, used: 50, remaining: 50 });
  });

  it('getFeatureQuota should return null remaining for unlimited feature', async () => {
    setupMocks();
    const { result } = renderHook(() => useTenantFeatures(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.features.length).toBeGreaterThan(0);
    });

    const quota = result.current.getFeatureQuota('advanced_scans');
    expect(quota).toEqual({ limit: null, used: 0, remaining: null });
  });

  it('getFeatureQuota should return default for non-existent feature', async () => {
    setupMocks();
    const { result } = renderHook(() => useTenantFeatures(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.features.length).toBeGreaterThan(0);
    });

    const quota = result.current.getFeatureQuota('non_existent');
    expect(quota).toEqual({ limit: null, used: 0, remaining: null });
  });

  it('canUseFeature should return true for enabled feature under quota', async () => {
    setupMocks();
    const { result } = renderHook(() => useTenantFeatures(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.canUseFeature('ai_analysis')).toBe(true);
    });
  });

  it('canUseFeature should return true for unlimited feature', async () => {
    setupMocks();
    const { result } = renderHook(() => useTenantFeatures(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.canUseFeature('advanced_scans')).toBe(true);
    });
  });

  it('canUseFeature should return false for disabled feature', async () => {
    setupMocks();
    const { result } = renderHook(() => useTenantFeatures(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.features.length).toBeGreaterThan(0);
    });

    expect(result.current.canUseFeature('disabled_feature')).toBe(false);
  });

  it('canUseFeature should return false for over-quota feature', async () => {
    setupMocks();
    const { result } = renderHook(() => useTenantFeatures(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.features.length).toBeGreaterThan(0);
    });

    expect(result.current.canUseFeature('over_quota')).toBe(false);
  });

  it('isNearQuota should return true when near threshold', async () => {
    setupMocks();
    const { result } = renderHook(() => useTenantFeatures(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.features.length).toBeGreaterThan(0);
    });

    expect(result.current.isNearQuota('near_quota')).toBe(true);
  });

  it('isNearQuota should return false when not near threshold', async () => {
    setupMocks();
    const { result } = renderHook(() => useTenantFeatures(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.features.length).toBeGreaterThan(0);
    });

    expect(result.current.isNearQuota('ai_analysis')).toBe(false);
  });

  it('isNearQuota should return false for unlimited feature', async () => {
    setupMocks();
    const { result } = renderHook(() => useTenantFeatures(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.features.length).toBeGreaterThan(0);
    });

    expect(result.current.isNearQuota('advanced_scans')).toBe(false);
  });

  it('isNearQuota should support custom threshold', async () => {
    setupMocks();
    const { result } = renderHook(() => useTenantFeatures(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.features.length).toBeGreaterThan(0);
    });

    // 50% used should be near at 40% threshold
    expect(result.current.isNearQuota('ai_analysis', 40)).toBe(true);
  });
});
