import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

// Mock dependencies
vi.mock('@/hooks/useAuth');
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
    auth: {
      getSession: vi.fn(),
    },
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

describe('useSubscription', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };
  const mockSession = { access_token: 'mock-token' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return loading state initially', () => {
    vi.mocked(useAuth).mockReturnValue({ user: mockUser, loading: false, signOut: vi.fn() });
    
    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.subscription).toBeUndefined();
  });

  it('should fetch subscription data successfully', async () => {
    const mockSubscription = {
      subscribed: true,
      plan_name: 'pro',
      device_quantity: 100,
      status: 'active',
      trial_end: null,
      current_period_end: '2025-12-31',
      features: {
        max_devices: { enabled: true, quota_limit: 100, quota_used: 50 },
      },
    };

    vi.mocked(useAuth).mockReturnValue({ user: mockUser, loading: false, signOut: vi.fn() });
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    } as any);
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: mockSubscription,
      error: null,
    } as any);

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.subscription).toEqual(mockSubscription);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('check-subscription', {
      headers: {
        Authorization: 'Bearer mock-token',
      },
    });
  });

  it('should not fetch when user is not authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false, signOut: vi.fn() });

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.subscription).toBeUndefined();
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('should handle errors gracefully', async () => {
    const mockError = new Error('Failed to fetch subscription');

    vi.mocked(useAuth).mockReturnValue({ user: mockUser, loading: false, signOut: vi.fn() });
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    } as any);
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: mockError,
    } as any);

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.subscription).toBeUndefined();
  });

  it('should support manual refetch', async () => {
    const mockSubscription = {
      subscribed: true,
      plan_name: 'starter',
      device_quantity: 30,
      status: 'active',
      trial_end: null,
      current_period_end: '2025-06-30',
      features: {},
    };

    vi.mocked(useAuth).mockReturnValue({ user: mockUser, loading: false, signOut: vi.fn() });
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    } as any);
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: mockSubscription,
      error: null,
    } as any);

    const { result } = renderHook(() => useSubscription(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Clear previous calls
    vi.clearAllMocks();

    // Trigger refetch
    await result.current.refetch();

    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
  });
});
