import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTenantFeatures } from './useTenantFeatures'
import { supabase } from '@/integrations/supabase/client'

vi.mock('./useTenant', () => ({
  useTenant: () => ({
    tenant: { id: 'tenant-123' },
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

describe('useTenantFeatures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should check if feature is enabled', async () => {
    const mockFeatures = [
      {
        feature_key: 'advanced_dashboard',
        enabled: true,
        quota_limit: null,
        quota_used: 0,
      },
    ]

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: mockFeatures,
          error: null,
        }),
      }),
    } as any)

    const { result } = renderHook(() => useTenantFeatures(), {
      wrapper: createWrapper(),
    })

    // Wait for query to complete
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(result.current.hasFeature('advanced_dashboard')).toBe(true)
    expect(result.current.hasFeature('non_existent')).toBe(false)
  })

  it('should calculate feature quota correctly', async () => {
    const mockFeatures = [
      {
        feature_key: 'max_devices',
        enabled: true,
        quota_limit: 10,
        quota_used: 7,
      },
    ]

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: mockFeatures,
          error: null,
        }),
      }),
    } as any)

    const { result } = renderHook(() => useTenantFeatures(), {
      wrapper: createWrapper(),
    })

    // Wait for query to complete
    await new Promise(resolve => setTimeout(resolve, 100))

    const quota = result.current.getFeatureQuota('max_devices')
    expect(quota.limit).toBe(10)
    expect(quota.used).toBe(7)
    expect(quota.remaining).toBe(3)
  })

  it('should check if feature can be used based on quota', async () => {
    const mockFeatures = [
      {
        feature_key: 'limited_feature',
        enabled: true,
        quota_limit: 5,
        quota_used: 5,
      },
      {
        feature_key: 'available_feature',
        enabled: true,
        quota_limit: 5,
        quota_used: 3,
      },
    ]

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: mockFeatures,
          error: null,
        }),
      }),
    } as any)

    const { result } = renderHook(() => useTenantFeatures(), {
      wrapper: createWrapper(),
    })

    // Wait for query to complete
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(result.current.canUseFeature('limited_feature')).toBe(false)
    expect(result.current.canUseFeature('available_feature')).toBe(true)
  })

  it('should detect near quota threshold', async () => {
    const mockFeatures = [
      {
        feature_key: 'near_limit',
        enabled: true,
        quota_limit: 100,
        quota_used: 85,
      },
    ]

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: mockFeatures,
          error: null,
        }),
      }),
    } as any)

    const { result } = renderHook(() => useTenantFeatures(), {
      wrapper: createWrapper(),
    })

    // Wait for query to complete
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(result.current.isNearQuota('near_limit', 80)).toBe(true)
    expect(result.current.isNearQuota('near_limit', 90)).toBe(false)
  })
})
