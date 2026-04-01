import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signOut: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: { expires_at: Math.floor(Date.now() / 1000) + 3600 } } }),
      refreshSession: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mockUser = { id: 'user-1', app_metadata: { is_super_admin: false, tenants: [], active_tenant_id: null } };

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

import { useSessionTimeout } from '../useSessionTimeout';

describe('useSessionTimeout', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns resetTimer, getTimeoutMinutes and getRemainingTime', () => {
    const { result } = renderHook(() => useSessionTimeout());
    expect(typeof result.current.resetTimer).toBe('function');
    expect(typeof result.current.getTimeoutMinutes).toBe('function');
    expect(typeof result.current.getRemainingTime).toBe('function');
  });

  it('getTimeoutMinutes returns 720 for regular user', () => {
    const { result } = renderHook(() => useSessionTimeout());
    expect(result.current.getTimeoutMinutes()).toBe(720);
  });

  it('getRemainingTime returns positive value after init', () => {
    const { result } = renderHook(() => useSessionTimeout());
    expect(result.current.getRemainingTime()).toBeGreaterThan(0);
  });

  it('resetTimer resets remaining time to near max', () => {
    const { result } = renderHook(() => useSessionTimeout());
    result.current.resetTimer();
    const timeoutMs = result.current.getTimeoutMinutes() * 60 * 1000;
    const remaining = result.current.getRemainingTime();
    expect(remaining).toBeGreaterThan(timeoutMs - 5000);
  });
});
