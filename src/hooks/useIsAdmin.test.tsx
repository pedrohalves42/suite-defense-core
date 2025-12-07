import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import React from 'react'
import { useIsAdmin } from './useIsAdmin'
import { supabase } from '@/integrations/supabase/client'

// Mock useAuth hook
vi.mock('./useAuth', () => ({
  useAuth: vi.fn(),
}))

// Mock supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}))

describe('useIsAdmin', () => {
  const mockUser = {
    id: 'user-123',
    email: 'admin@example.com',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return false when user is not authenticated', async () => {
    const { useAuth } = await import('./useAuth')
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      loading: false,
    })

    const { result } = renderHook(() => useIsAdmin())

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.isAdmin).toBe(false)
  })

  it('should return true when user is super_admin', async () => {
    const { useAuth } = await import('./useAuth')
    vi.mocked(useAuth).mockReturnValue({
      user: mockUser as any,
      loading: false,
    })

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: true, // is super_admin
      error: null,
    })

    const { result } = renderHook(() => useIsAdmin())

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.isAdmin).toBe(true)
    expect(supabase.rpc).toHaveBeenCalledWith('has_role', {
      _user_id: mockUser.id,
      _role: 'super_admin',
    })
  })

  it('should return true when user is regular admin', async () => {
    const { useAuth } = await import('./useAuth')
    vi.mocked(useAuth).mockReturnValue({
      user: mockUser as any,
      loading: false,
    })

    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({
        data: false, // not super_admin
        error: null,
      })
      .mockResolvedValueOnce({
        data: true, // is admin
        error: null,
      })

    const { result } = renderHook(() => useIsAdmin())

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.isAdmin).toBe(true)
  })

  it('should return false when user has no admin role', async () => {
    const { useAuth } = await import('./useAuth')
    vi.mocked(useAuth).mockReturnValue({
      user: mockUser as any,
      loading: false,
    })

    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({
        data: false, // not super_admin
        error: null,
      })
      .mockResolvedValueOnce({
        data: false, // not admin
        error: null,
      })

    const { result } = renderHook(() => useIsAdmin())

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.isAdmin).toBe(false)
  })

  it('should handle RPC errors gracefully', async () => {
    const { useAuth } = await import('./useAuth')
    vi.mocked(useAuth).mockReturnValue({
      user: mockUser as any,
      loading: false,
    })

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'RPC failed' },
    })

    const { result } = renderHook(() => useIsAdmin())

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.isAdmin).toBe(false)
  })

  it('should show loading while auth is loading', async () => {
    const { useAuth } = await import('./useAuth')
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      loading: true,
    })

    const { result } = renderHook(() => useIsAdmin())

    expect(result.current.loading).toBe(true)
  })

  it('should handle race conditions with isCancelled flag', async () => {
    const { useAuth } = await import('./useAuth')
    vi.mocked(useAuth).mockReturnValue({
      user: mockUser as any,
      loading: false,
    })

    // Simulate slow RPC response
    vi.mocked(supabase.rpc).mockImplementation(() => 
      new Promise(resolve => 
        setTimeout(() => resolve({ data: true, error: null }), 100)
      )
    )

    const { result, unmount } = renderHook(() => useIsAdmin())

    // Unmount before RPC completes
    unmount()

    // Should not throw or update state after unmount
    expect(result.current.loading).toBe(true)
  })
})
