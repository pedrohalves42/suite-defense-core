import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

// Mock dependencies
vi.mock('@/hooks/useAuth');
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('useTenant', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };
  const mockTenant = {
    id: 'tenant-123',
    name: 'Test Company',
    slug: 'test-company',
    owner_user_id: 'user-123',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return loading state initially', () => {
    vi.mocked(useAuth).mockReturnValue({ user: mockUser, loading: false, signOut: vi.fn() });
    
    const { result } = renderHook(() => useTenant(), {
      wrapper: createWrapper(),
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.tenant).toBe(null);
  });

  it('should fetch tenant data successfully', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: mockUser, loading: false, signOut: vi.fn() });
    
    const mockUserRoleQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { tenant_id: 'tenant-123' },
        error: null,
      }),
    };

    const mockTenantQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: mockTenant,
        error: null,
      }),
    };

    vi.mocked(supabase.from)
      .mockReturnValueOnce(mockUserRoleQuery as any)
      .mockReturnValueOnce(mockTenantQuery as any);

    const { result } = renderHook(() => useTenant(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tenant).toEqual(mockTenant);
    expect(supabase.from).toHaveBeenCalledWith('user_roles');
    expect(supabase.from).toHaveBeenCalledWith('tenants');
  });

  it('should return null when user has no tenant', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: mockUser, loading: false, signOut: vi.fn() });
    
    const mockUserRoleQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    };

    vi.mocked(supabase.from).mockReturnValue(mockUserRoleQuery as any);

    const { result } = renderHook(() => useTenant(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tenant).toBe(null);
  });

  it('should not fetch when user is not authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false, signOut: vi.fn() });

    const { result } = renderHook(() => useTenant(), {
      wrapper: createWrapper(),
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.tenant).toBe(null);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('should handle errors gracefully', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: mockUser, loading: false, signOut: vi.fn() });
    
    const mockError = new Error('Database error');
    const mockUserRoleQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: mockError,
      }),
    };

    vi.mocked(supabase.from).mockReturnValue(mockUserRoleQuery as any);

    const { result } = renderHook(() => useTenant(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tenant).toBe(null);
  });

  it('should cache tenant data for 10 minutes', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: mockUser, loading: false, signOut: vi.fn() });
    
    const mockUserRoleQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { tenant_id: 'tenant-123' },
        error: null,
      }),
    };

    const mockTenantQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: mockTenant,
        error: null,
      }),
    };

    vi.mocked(supabase.from)
      .mockReturnValue(mockUserRoleQuery as any)
      .mockReturnValueOnce(mockUserRoleQuery as any)
      .mockReturnValueOnce(mockTenantQuery as any);

    const { result, rerender } = renderHook(() => useTenant(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const firstCallCount = vi.mocked(supabase.from).mock.calls.length;

    // Rerender should use cache
    rerender();

    // Should not trigger new fetch due to staleTime
    expect(vi.mocked(supabase.from).mock.calls.length).toBe(firstCallCount);
  });
});
