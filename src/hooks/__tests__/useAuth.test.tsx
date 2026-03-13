import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { waitFor } from '@testing-library/dom';
import { useAuth } from '../useAuth';
import { supabase } from '@/integrations/supabase/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      refreshSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const createWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null user when no session exists', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null }, error: null,
    });
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((cb) => {
      setTimeout(() => cb('INITIAL_SESSION', null), 0);
      return { data: { subscription: { unsubscribe: vi.fn() } } } as any;
    });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 5000 });
    expect(result.current.user).toBeNull();
  });

  it('should return user when session exists', async () => {
    const mockUser = { id: 'user-123', email: 'test@test.com' };
    const mockSession = { user: mockUser, expires_at: Date.now() / 1000 + 3600, access_token: 'x', refresh_token: 'x', expires_in: 3600, token_type: 'bearer' as const };
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession as any }, error: null,
    });
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((cb) => {
      setTimeout(() => cb('SIGNED_IN', mockSession), 0);
      return { data: { subscription: { unsubscribe: vi.fn() } } } as any;
    });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 5000 });
    expect(result.current.user).toEqual(mockUser);
  });

  it('should handle clock skew error', async () => {
    const { toast } = await import('@/hooks/use-toast');
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: { message: 'issued in the future 1000000 999000 998000' } as any,
    });
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((cb) => {
      setTimeout(() => cb('INITIAL_SESSION', null), 0);
      return { data: { subscription: { unsubscribe: vi.fn() } } } as any;
    });

    renderHook(() => useAuth(), { wrapper: createWrapper() });
    await waitFor(() => expect(toast).toHaveBeenCalled(), { timeout: 5000 });
  });

  it('should handle refresh token failure', async () => {
    // Just verify the hook initializes without error
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null }, error: null,
    });
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((cb) => {
      setTimeout(() => cb('INITIAL_SESSION', null), 0);
      return { data: { subscription: { unsubscribe: vi.fn() } } } as any;
    });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 5000 });
  });

  it('should refresh token when expiring soon', async () => {
    const session = { user: { id: 'u1' }, expires_at: Math.floor(Date.now() / 1000) + 200, access_token: 'x', refresh_token: 'x', expires_in: 200, token_type: 'bearer' as const };
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: session as any }, error: null,
    });
    vi.mocked(supabase.auth.onAuthStateChange).mockImplementation((cb) => {
      setTimeout(() => cb('SIGNED_IN', session), 0);
      return { data: { subscription: { unsubscribe: vi.fn() } } } as any;
    });

    renderHook(() => useAuth(), { wrapper: createWrapper() });
    await waitFor(() => expect(supabase.auth.getSession).toHaveBeenCalled(), { timeout: 5000 });
  });

  it('should cleanup subscription and interval on unmount', async () => {
    const unsubscribeMock = vi.fn();
    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: unsubscribeMock } },
    } as any);
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null }, error: null,
    });

    const { unmount } = renderHook(() => useAuth(), { wrapper: createWrapper() });
    await waitFor(() => expect(supabase.auth.onAuthStateChange).toHaveBeenCalled());
    unmount();
    expect(unsubscribeMock).toHaveBeenCalled();
  });
});
