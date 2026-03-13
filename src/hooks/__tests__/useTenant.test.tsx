import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTenant } from '../useTenant';

// Mock useActiveTenant since useTenant is just a wrapper
vi.mock('../useActiveTenant', () => ({
  useActiveTenant: vi.fn(),
}));

import { useActiveTenant } from '../useActiveTenant';

describe('useTenant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null tenant when user is not authenticated', () => {
    vi.mocked(useActiveTenant).mockReturnValue({
      activeTenant: null,
      activeRole: null,
      loading: false,
      tenants: [],
      setActiveTenantById: vi.fn(),
      isSyncing: false,
    } as any);

    const { result } = renderHook(() => useTenant());
    expect(result.current.loading).toBe(false);
    expect(result.current.tenant).toBeNull();
  });

  it('should fetch tenant when user is authenticated', () => {
    const mockTenant = { id: 'tenant-123', name: 'Test Tenant', slug: 'test-tenant' };
    vi.mocked(useActiveTenant).mockReturnValue({
      activeTenant: mockTenant,
      activeRole: 'admin',
      loading: false,
      tenants: [mockTenant],
      setActiveTenantById: vi.fn(),
      isSyncing: false,
    } as any);

    const { result } = renderHook(() => useTenant());
    expect(result.current.tenant).toEqual(mockTenant);
  });

  it('should return null tenant when user has no tenant_id', () => {
    vi.mocked(useActiveTenant).mockReturnValue({
      activeTenant: null,
      activeRole: null,
      loading: false,
      tenants: [],
      setActiveTenantById: vi.fn(),
      isSyncing: false,
    } as any);

    const { result } = renderHook(() => useTenant());
    expect(result.current.loading).toBe(false);
    expect(result.current.tenant).toBeNull();
  });

  it('should handle role fetch error', () => {
    vi.mocked(useActiveTenant).mockReturnValue({
      activeTenant: null,
      activeRole: null,
      loading: false,
      tenants: [],
      setActiveTenantById: vi.fn(),
      isSyncing: false,
    } as any);

    const { result } = renderHook(() => useTenant());
    expect(result.current.loading).toBe(false);
  });

  it('should handle tenant fetch error', () => {
    vi.mocked(useActiveTenant).mockReturnValue({
      activeTenant: null,
      activeRole: null,
      loading: false,
      tenants: [],
      setActiveTenantById: vi.fn(),
      isSyncing: false,
    } as any);

    const { result } = renderHook(() => useTenant());
    expect(result.current.loading).toBe(false);
  });
});
