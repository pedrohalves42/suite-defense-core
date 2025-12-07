import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import React from 'react'
import { useSuperAdmin } from './useSuperAdmin'
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

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

describe('useSuperAdmin', () => {
  const mockUser = {
    id: 'user-123',
    email: 'superadmin@example.com',
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

    const { result } = renderHook(() => useSuperAdmin())

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.isSuperAdmin).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('should return true when user is super_admin', async () => {
    const { useAuth } = await import('./useAuth')
    vi.mocked(useAuth).mockReturnValue({
      user: mockUser as any,
      loading: false,
    })

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: true,
      error: null,
    })

    const { result } = renderHook(() => useSuperAdmin())

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.isSuperAdmin).toBe(true)
    expect(result.current.error).toBeNull()
    expect(supabase.rpc).toHaveBeenCalledWith('is_super_admin', {
      _user_id: mockUser.id,
    })
  })

  it('should return false when user is not super_admin', async () => {
    const { useAuth } = await import('./useAuth')
    vi.mocked(useAuth).mockReturnValue({
      user: mockUser as any,
      loading: false,
    })

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: false,
      error: null,
    })

    const { result } = renderHook(() => useSuperAdmin())

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.isSuperAdmin).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('should handle RPC errors and set error state', async () => {
    const { useAuth } = await import('./useAuth')
    vi.mocked(useAuth).mockReturnValue({
      user: mockUser as any,
      loading: false,
    })

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'RPC is_super_admin failed' },
    })

    const { result } = renderHook(() => useSuperAdmin())

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.isSuperAdmin).toBe(false)
    expect(result.current.error).toContain('Failed to verify super admin status')
  })

  it('should show loading while auth is loading', async () => {
    const { useAuth } = await import('./useAuth')
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      loading: true,
    })

    const { result } = renderHook(() => useSuperAdmin())

    expect(result.current.loading).toBe(true)
  })

  it('should handle null RPC response as false', async () => {
    const { useAuth } = await import('./useAuth')
    vi.mocked(useAuth).mockReturnValue({
      user: mockUser as any,
      loading: false,
    })

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: null,
    })

    const { result } = renderHook(() => useSuperAdmin())

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.isSuperAdmin).toBe(false)
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

    const { result, unmount } = renderHook(() => useSuperAdmin())

    // Unmount before RPC completes
    unmount()

    // Should not throw or update state after unmount
    expect(result.current.loading).toBe(true)
  })

  it('should re-check when user changes', async () => {
    const { useAuth } = await import('./useAuth')
    
    const mockUseAuth = vi.mocked(useAuth)
    mockUseAuth.mockReturnValue({
      user: mockUser as any,
      loading: false,
    })

    vi.mocked(supabase.rpc).mockResolvedValue({
      data: true,
      error: null,
    })

    const { result, rerender } = renderHook(() => useSuperAdmin())

    await vi.waitFor(() => {
      expect(result.current.isSuperAdmin).toBe(true)
    })

    // Simulate user change
    const newUser = { ...mockUser, id: 'new-user-456' }
    mockUseAuth.mockReturnValue({
      user: newUser as any,
      loading: false,
    })

    rerender()

    await vi.waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('is_super_admin', {
        _user_id: newUser.id,
      })
    })
  })
})
