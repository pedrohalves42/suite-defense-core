import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { waitFor } from '@testing-library/dom';
import { useAuth } from '../useAuth';
import { AuthError } from '@supabase/supabase-js';
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

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return null user when no session exists', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toBeNull();
  });

  it('should return user when session exists', async () => {
    const mockUser = { id: 'user-123', email: 'test@test.com' };
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: mockUser, expires_at: Date.now() / 1000 + 3600 } as any },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toEqual(mockUser);
  });

  it('should handle clock skew error', async () => {
    const { toast } = await import('@/hooks/use-toast');
    const clockSkewError = new AuthError('issued in the future 1000000 999000 998000', 400, 'clock_skew');
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: clockSkewError,
    });

    renderHook(() => useAuth(), { wrapper: createWrapper() });
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Relogio do Sistema Dessincronizado',
          variant: 'destructive',
        })
      );
    });
  });

  it('should refresh token when expiring soon', async () => {
    const expiringSession = {
      user: { id: 'user-123' },
      expires_at: Math.floor(Date.now() / 1000) + 200, // 200 seconds until expiry
    };
    
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: expiringSession as any },
      error: null,
    });
    vi.mocked(supabase.auth.refreshSession).mockResolvedValue({
      data: { session: expiringSession as any, user: expiringSession.user as any },
      error: null,
    });

    renderHook(() => useAuth(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(supabase.auth.getSession).toHaveBeenCalled();
    });

    // Advance timer to trigger token check
    await act(async () => {
      vi.advanceTimersByTime(120000);
    });

    await waitFor(() => {
      expect(supabase.auth.refreshSession).toHaveBeenCalled();
    });
  });

  it('should handle refresh token failure', async () => {
    const { toast } = await import('@/hooks/use-toast');
    const { logger } = await import('@/lib/logger');
    
    const expiringSession = {
      user: { id: 'user-123' },
      expires_at: Math.floor(Date.now() / 1000) + 100, // Less than 5 min
    };
    
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: expiringSession as any },
      error: null,
    });
    const refreshError = new AuthError('Refresh failed', 401, 'refresh_error');
    vi.mocked(supabase.auth.refreshSession).mockResolvedValue({
      data: { session: null, user: null },
      error: refreshError,
    });
    renderHook(() => useAuth(), { wrapper: createWrapper() });

    await act(async () => {
      vi.advanceTimersByTime(120000);
    });

    await waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith('Failed to refresh token', expect.any(Object));
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Sessao expirada',
          variant: 'destructive',
        })
      );
    });
  });

  it('should cleanup subscription and interval on unmount', async () => {
    const unsubscribeMock = vi.fn();
    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: unsubscribeMock } },
    } as any);
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const { unmount } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(supabase.auth.getSession).toHaveBeenCalled();
    });

    unmount();

    expect(unsubscribeMock).toHaveBeenCalled();
  });
});
