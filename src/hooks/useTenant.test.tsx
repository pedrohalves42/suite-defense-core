import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTenant } from './useTenant'

// Mock useActiveTenant since useTenant is just a wrapper
vi.mock('./useActiveTenant', () => ({
  useActiveTenant: vi.fn(),
}))

import { useActiveTenant } from './useActiveTenant'

describe('useTenant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return null when no user', () => {
    vi.mocked(useActiveTenant).mockReturnValue({
      activeTenant: null,
      activeRole: null,
      loading: false,
      tenants: [],
      setActiveTenantById: vi.fn(),
      isSyncing: false,
    } as any)

    const { result } = renderHook(() => useTenant())
    expect(result.current.tenant).toBeNull()
  })

  it('should return tenant when user has tenant', () => {
    const mockTenant = { id: 'tenant-123', name: 'Test Tenant', slug: 'test-tenant' }
    vi.mocked(useActiveTenant).mockReturnValue({
      activeTenant: mockTenant,
      activeRole: 'admin',
      loading: false,
      tenants: [mockTenant],
      setActiveTenantById: vi.fn(),
      isSyncing: false,
    } as any)

    const { result } = renderHook(() => useTenant())
    expect(result.current.tenant).toEqual(mockTenant)
  })

  it('should handle multiple roles gracefully', () => {
    const mockTenant = { id: 'tenant-123', name: 'Test Tenant' }
    vi.mocked(useActiveTenant).mockReturnValue({
      activeTenant: mockTenant,
      activeRole: 'super_admin',
      loading: false,
      tenants: [mockTenant],
      setActiveTenantById: vi.fn(),
      isSyncing: false,
    } as any)

    const { result } = renderHook(() => useTenant())
    expect(result.current.tenant).toBeDefined()
    expect(result.current.role).toBe('super_admin')
  })
})
