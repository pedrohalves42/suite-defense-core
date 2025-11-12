import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSubscription } from './useSubscription'
import { supabase } from '@/integrations/supabase/client'

vi.mock('./useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', email: 'test@example.com' },
    loading: false,
  }),
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return subscription data', async () => {
    const mockSubscription = {
      subscribed: true,
      plan_name: 'pro',
      device_quantity: 5,
      status: 'active',
      trial_end: null,
      current_period_end: '2025-12-31',
      features: {},
    }

    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: mockSubscription,
      error: null,
    })

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: {
        session: {
          access_token: 'test-token',
        } as any,
      },
      error: null,
    })

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    })

    // Wait for query to complete
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(result.current.subscription).toEqual(mockSubscription)
  })

  it('should handle API errors', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: new Error('API Error'),
    })

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: {
        session: {
          access_token: 'test-token',
        } as any,
      },
      error: null,
    })

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    })

    // Wait for query to complete
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(result.current.subscription).toBeUndefined()
  })
})
