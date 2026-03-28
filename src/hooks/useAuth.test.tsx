import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { useAuth } from './useAuth'
import { supabase } from '@/integrations/supabase/client'

// Mock supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      refreshSession: vi.fn(),
    },
  },
}))

// Mock toast
vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('useAuth', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  }

  const mockSession = {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: 'bearer' as const,
    user: mockUser,
  }

  let unsubscribeMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    
    unsubscribeMock = vi.fn()
    
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
      return {
        data: { subscription: { unsubscribe: unsubscribeMock } },
      } as any
    })
  })

  it('should return null user and loading true initially', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    })

    // Also trigger the onAuthStateChange callback
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
      // Simulate auth state change after setup
      setTimeout(() => callback('INITIAL_SESSION', null), 0)
      return {
        data: { subscription: { unsubscribe: unsubscribeMock } },
      } as any
    })

    const { result } = renderHook(() => useAuth())

    expect(result.current.loading).toBe(true)
    
    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 5000 })
    
    expect(result.current.user).toBeNull()
  })

  it('should return user when session exists', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
      setTimeout(() => callback('SIGNED_IN', mockSession), 0)
      return {
        data: { subscription: { unsubscribe: unsubscribeMock } },
      } as any
    })

    const { result } = renderHook(() => useAuth())

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 5000 })

    expect(result.current.user).toEqual(mockUser)
  })

  it('should update user on auth state change', async () => {
    let authCallback: ((event: string, session: any) => void) | null = null
    
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
      authCallback = callback
      return {
        data: { subscription: { unsubscribe: unsubscribeMock } },
      } as any
    })

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    })

    const { result } = renderHook(() => useAuth())

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    }, { timeout: 5000 })

    expect(result.current.user).toBeNull()

    // Simulate sign in
    act(() => {
      authCallback?.('SIGNED_IN', mockSession)
    })

    expect(result.current.user).toEqual(mockUser)
  })

  it('should clear user on sign out', async () => {
    let authCallback: ((event: string, session: any) => void) | null = null
    
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
      authCallback = callback
      return {
        data: { subscription: { unsubscribe: unsubscribeMock } },
      } as any
    })

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    const { result } = renderHook(() => useAuth())

    await vi.waitFor(() => {
      expect(result.current.user).toEqual(mockUser)
    }, { timeout: 5000 })

    // Simulate sign out
    act(() => {
      authCallback?.('SIGNED_OUT', null)
    })

    expect(result.current.user).toBeNull()
  })

  it('should unsubscribe on unmount', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    })

    const { unmount } = renderHook(() => useAuth())

    await vi.waitFor(() => {
      expect(supabase.auth.onAuthStateChange).toHaveBeenCalled()
    })

    unmount()

    expect(unsubscribeMock).toHaveBeenCalled()
  })

  it('should handle clock skew error gracefully', async () => {
    const { toast } = await import('@/hooks/use-toast')
    
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: { message: 'issued in the future 1000 2000 3000' } as any,
    })

    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
      setTimeout(() => callback('INITIAL_SESSION', null), 0)
      return {
        data: { subscription: { unsubscribe: unsubscribeMock } },
      } as any
    })

    renderHook(() => useAuth())

    await vi.waitFor(() => {
      expect(toast).toHaveBeenCalled()
    }, { timeout: 5000 })
  })
})
