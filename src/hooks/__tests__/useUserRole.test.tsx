import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/hooks/useActiveTenant', () => ({
  useActiveTenant: vi.fn(),
}));

import { useActiveTenant } from '@/hooks/useActiveTenant';
import { useUserRole } from '@/hooks/useUserRole';

const mockUseActiveTenant = vi.mocked(useActiveTenant);

describe('useUserRole', () => {
  it('derives super_admin correctly', () => {
    mockUseActiveTenant.mockReturnValue({
      activeRole: 'super_admin',
      loading: false,
      activeTenant: null,
      switchTenant: vi.fn(),
      tenants: [],
    } as any);

    const { result } = renderHook(() => useUserRole());
    expect(result.current.isSuperAdmin).toBe(true);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.canWrite).toBe(true);
  });

  it('derives admin correctly', () => {
    mockUseActiveTenant.mockReturnValue({
      activeRole: 'admin',
      loading: false,
      activeTenant: null,
      switchTenant: vi.fn(),
      tenants: [],
    } as any);

    const { result } = renderHook(() => useUserRole());
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.isSuperAdmin).toBe(false);
    expect(result.current.canWrite).toBe(true);
  });

  it('derives viewer correctly', () => {
    mockUseActiveTenant.mockReturnValue({
      activeRole: 'viewer',
      loading: false,
      activeTenant: null,
      switchTenant: vi.fn(),
      tenants: [],
    } as any);

    const { result } = renderHook(() => useUserRole());
    expect(result.current.isViewer).toBe(true);
    expect(result.current.canWrite).toBe(false);
  });

  it('derives operator correctly', () => {
    mockUseActiveTenant.mockReturnValue({
      activeRole: 'operator',
      loading: false,
      activeTenant: null,
      switchTenant: vi.fn(),
      tenants: [],
    } as any);

    const { result } = renderHook(() => useUserRole());
    expect(result.current.isOperator).toBe(true);
    expect(result.current.canWrite).toBe(true);
  });

  it('derives analyst correctly', () => {
    mockUseActiveTenant.mockReturnValue({
      activeRole: 'analyst',
      loading: false,
      activeTenant: null,
      switchTenant: vi.fn(),
      tenants: [],
    } as any);

    const { result } = renderHook(() => useUserRole());
    expect(result.current.isAnalyst).toBe(true);
    expect(result.current.canWrite).toBe(true);
  });

  it('returns loading state', () => {
    mockUseActiveTenant.mockReturnValue({
      activeRole: null,
      loading: true,
      activeTenant: null,
      switchTenant: vi.fn(),
      tenants: [],
    } as any);

    const { result } = renderHook(() => useUserRole());
    expect(result.current.loading).toBe(true);
  });
});
