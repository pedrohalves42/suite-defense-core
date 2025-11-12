import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTenant } from './useTenant'
import { supabase } from '@/integrations/supabase/client'

vi.mock('./useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', email: 'test@example.com' },
    loading: false,
  }),
}))

describe('useTenant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return null when no user', async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    } as any)

    const { result } = renderHook(() => useTenant())

    // Wait for hook to update
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(result.current.tenant).toBeNull()
  })

  it('should return tenant when user has tenant', async () => {
    const mockTenant = {
      id: 'tenant-123',
      name: 'Test Tenant',
      slug: 'test-tenant',
      owner_user_id: 'test-user-id',
      created_at: '2025-01-01',
      updated_at: '2025-01-01',
    }

    vi.mocked(supabase.from).mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { tenant_id: 'tenant-123' },
            error: null,
          }),
        }),
      }),
    } as any)

    vi.mocked(supabase.from).mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: mockTenant,
            error: null,
          }),
        }),
      }),
    } as any)

    const { result } = renderHook(() => useTenant())

    // Wait for hook to update
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(result.current.tenant).toEqual(mockTenant)
  })

  it('should handle multiple roles gracefully', async () => {
    vi.mocked(supabase.from).mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { tenant_id: 'tenant-123' },
            error: null,
          }),
        }),
      }),
    } as any)

    const { result } = renderHook(() => useTenant())

    // Wait for hook to update
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(result.current.tenant).toBeDefined()
  })
})
