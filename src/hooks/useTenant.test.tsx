import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// Mock useActiveTenant since useTenant is just a wrapper
const mockUseActiveTenant = vi.fn()
vi.mock('./useActiveTenant', () => ({
  useActiveTenant: (...args: any[]) => mockUseActiveTenant(...args),
}))

import { useTenant } from './useTenant'

describe('useTenant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return null when no user', () => {
    mockUseActiveTenant.mockReturnValue({
      activeTenant: null,
      activeRole: null,
      loading: false,
      tenants: [],
      setActiveTenantById: vi.fn(),
      isSyncing: false,
    })

    const { result } = renderHook(() => useTenant())
    expect(result.current.tenant).toBeNull()
  })

  it('should return tenant when user has tenant', () => {
    const mockTenant = { id: 'tenant-123', name: 'Test Tenant', slug: 'test-tenant' }
    mockUseActiveTenant.mockReturnValue({
      activeTenant: mockTenant,
      activeRole: 'admin',
      loading: false,
      tenants: [mockTenant],
      setActiveTenantById: vi.fn(),
      isSyncing: false,
    })

    const { result } = renderHook(() => useTenant())
    expect(result.current.tenant).toEqual(mockTenant)
  })

  it('should handle multiple roles gracefully', () => {
    const mockTenant = { id: 'tenant-123', name: 'Test Tenant' }
    mockUseActiveTenant.mockReturnValue({
      activeTenant: mockTenant,
      activeRole: 'super_admin',
      loading: false,
      tenants: [mockTenant],
      setActiveTenantById: vi.fn(),
      isSyncing: false,
    })

    const { result } = renderHook(() => useTenant())
    expect(result.current.tenant).toBeDefined()
    expect(result.current.role).toBe('super_admin')
  })
})
