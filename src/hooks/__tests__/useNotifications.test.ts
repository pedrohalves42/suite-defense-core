import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({
    tenant: { id: 'tenant-abc' },
    loading: false,
  }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { useNotifications } from '../useNotifications';

describe('useNotifications', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts with empty notifications', () => {
    const { result } = renderHook(() => useNotifications());
    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  it('addNotification adds a notification', () => {
    const { result } = renderHook(() => useNotifications());
    act(() => {
      result.current.addNotification({
        title: 'Test',
        message: 'Test message',
        type: 'info',
      });
    });
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].title).toBe('Test');
    expect(result.current.notifications[0].read).toBe(false);
    expect(result.current.unreadCount).toBe(1);
  });

  it('markAsRead marks a specific notification', () => {
    const { result } = renderHook(() => useNotifications());
    act(() => {
      result.current.addNotification({ title: 'A', message: 'msg', type: 'info' });
    });
    const id = result.current.notifications[0].id;
    act(() => result.current.markAsRead(id));
    expect(result.current.notifications[0].read).toBe(true);
    expect(result.current.unreadCount).toBe(0);
  });

  it('markAllAsRead marks all notifications', () => {
    const { result } = renderHook(() => useNotifications());
    act(() => {
      result.current.addNotification({ title: 'A', message: 'msg', type: 'info' });
      result.current.addNotification({ title: 'B', message: 'msg', type: 'warning' });
    });
    expect(result.current.unreadCount).toBe(2);
    act(() => result.current.markAllAsRead());
    expect(result.current.unreadCount).toBe(0);
  });

  it('limits notifications to 50', () => {
    const { result } = renderHook(() => useNotifications());
    act(() => {
      for (let i = 0; i < 55; i++) {
        result.current.addNotification({ title: `N${i}`, message: 'msg', type: 'info' });
      }
    });
    expect(result.current.notifications.length).toBeLessThanOrEqual(50);
  });
});
