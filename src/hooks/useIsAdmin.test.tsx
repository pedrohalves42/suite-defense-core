import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import React from 'react'
import { useIsAdmin } from './useIsAdmin'

// Mock useActiveTenant hook (V-704 fix: useIsAdmin now delegates to useActiveTenant)
const mockUseActiveTenant = vi.fn()

vi.mock('./useActiveTenant', () => ({
  useActiveTenant: () => mockUseActiveTenant(),
}))

describe('useIsAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return false when activeRole is null (no tenant)', () => {
    mockUseActiveTenant.mockReturnValue({
      activeRole: null,
      loading: false,
    })

    const { result } = renderHook(() => useIsAdmin())

    expect(result.current.loading).toBe(false)
    expect(result.current.isAdmin).toBe(false)
  })

  it('should return true when activeRole is super_admin', () => {
    mockUseActiveTenant.mockReturnValue({
      activeRole: 'super_admin',
      loading: false,
    })

    const { result } = renderHook(() => useIsAdmin())

    expect(result.current.loading).toBe(false)
    expect(result.current.isAdmin).toBe(true)
  })

  it('should return true when activeRole is admin', () => {
    mockUseActiveTenant.mockReturnValue({
      activeRole: 'admin',
      loading: false,
    })

    const { result } = renderHook(() => useIsAdmin())

    expect(result.current.loading).toBe(false)
    expect(result.current.isAdmin).toBe(true)
  })

  it('should return false when activeRole is viewer', () => {
    mockUseActiveTenant.mockReturnValue({
      activeRole: 'viewer',
      loading: false,
    })

    const { result } = renderHook(() => useIsAdmin())

    expect(result.current.loading).toBe(false)
    expect(result.current.isAdmin).toBe(false)
  })

  it('should return false when activeRole is operator', () => {
    mockUseActiveTenant.mockReturnValue({
      activeRole: 'operator',
      loading: false,
    })

    const { result } = renderHook(() => useIsAdmin())

    expect(result.current.loading).toBe(false)
    expect(result.current.isAdmin).toBe(false)
  })

  it('should return false when activeRole is analyst', () => {
    mockUseActiveTenant.mockReturnValue({
      activeRole: 'analyst',
      loading: false,
    })

    const { result } = renderHook(() => useIsAdmin())

    expect(result.current.loading).toBe(false)
    expect(result.current.isAdmin).toBe(false)
  })

  it('should show loading while tenant is loading', () => {
    mockUseActiveTenant.mockReturnValue({
      activeRole: null,
      loading: true,
    })

    const { result } = renderHook(() => useIsAdmin())

    expect(result.current.loading).toBe(true)
  })
})
