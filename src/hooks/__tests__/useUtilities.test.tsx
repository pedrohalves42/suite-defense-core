import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

// ===== useDebounce =====
describe('useDebounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns initial value immediately', async () => {
    const { useDebounce } = await import('@/hooks/useDebounce');
    const { result } = renderHook(() => useDebounce('hello', 500));
    expect(result.current).toBe('hello');
  });

  it('debounces value updates', async () => {
    const { useDebounce } = await import('@/hooks/useDebounce');
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'a', delay: 300 } }
    );
    expect(result.current).toBe('a');
    
    rerender({ value: 'b', delay: 300 });
    expect(result.current).toBe('a'); // Not yet updated
    
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe('b');
  });

  it('cancels previous timer on rapid changes', async () => {
    const { useDebounce } = await import('@/hooks/useDebounce');
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 500),
      { initialProps: { value: 'a' } }
    );
    
    rerender({ value: 'b' });
    act(() => vi.advanceTimersByTime(200));
    rerender({ value: 'c' });
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe('c'); // skipped 'b'
  });

  it('uses default delay of 500ms', async () => {
    const { useDebounce } = await import('@/hooks/useDebounce');
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value),
      { initialProps: { value: 'init' } }
    );
    rerender({ value: 'updated' });
    act(() => vi.advanceTimersByTime(499));
    expect(result.current).toBe('init');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe('updated');
  });
});

// ===== usePageVisibility =====
describe('usePageVisibility', () => {
  it('returns true when document is visible', async () => {
    Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
    const { usePageVisibility } = await import('@/hooks/usePageVisibility');
    const { result } = renderHook(() => usePageVisibility());
    expect(result.current).toBe(true);
  });

  it('updates on visibilitychange event', async () => {
    Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
    const { usePageVisibility } = await import('@/hooks/usePageVisibility');
    const { result } = renderHook(() => usePageVisibility());
    expect(result.current).toBe(true);
    
    act(() => {
      Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe(false);
  });
});

// ===== useOnlineStatus =====
describe('useOnlineStatus', () => {
  it('returns current online status', async () => {
    const { useOnlineStatus } = await import('@/hooks/useOnlineStatus');
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(navigator.onLine);
    expect(result.current.wasOffline).toBe(false);
  });

  it('detects offline event', async () => {
    const { useOnlineStatus } = await import('@/hooks/useOnlineStatus');
    const { result } = renderHook(() => useOnlineStatus());
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.isOnline).toBe(false);
    expect(result.current.wasOffline).toBe(true);
  });

  it('detects online event', async () => {
    const { useOnlineStatus } = await import('@/hooks/useOnlineStatus');
    const { result } = renderHook(() => useOnlineStatus());
    act(() => window.dispatchEvent(new Event('offline')));
    act(() => window.dispatchEvent(new Event('online')));
    expect(result.current.isOnline).toBe(true);
  });
});

// ===== useRealTimeCountdown =====
describe('useRealTimeCountdown', () => {
  it('returns expired for null input', async () => {
    const { useRealTimeCountdown } = await import('@/hooks/useRealTimeCountdown');
    const { result } = renderHook(() => useRealTimeCountdown(null));
    expect(result.current.isExpired).toBe(true);
    expect(result.current.text).toBe('--');
    expect(result.current.urgency).toBe('expired');
  });

  it('returns expired for past date', async () => {
    const { useRealTimeCountdown } = await import('@/hooks/useRealTimeCountdown');
    const past = new Date(Date.now() - 60000).toISOString();
    const { result } = renderHook(() => useRealTimeCountdown(past));
    expect(result.current.isExpired).toBe(true);
    expect(result.current.text).toBe('Expirado');
  });

  it('returns danger urgency for < 60 minutes', async () => {
    const { useRealTimeCountdown } = await import('@/hooks/useRealTimeCountdown');
    const future = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min
    const { result } = renderHook(() => useRealTimeCountdown(future));
    expect(result.current.isExpired).toBe(false);
    expect(result.current.urgency).toBe('danger');
  });

  it('returns warning urgency for < 6 hours', async () => {
    const { useRealTimeCountdown } = await import('@/hooks/useRealTimeCountdown');
    const future = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(); // 3h
    const { result } = renderHook(() => useRealTimeCountdown(future));
    expect(result.current.urgency).toBe('warning');
  });

  it('returns normal urgency for >= 6 hours', async () => {
    const { useRealTimeCountdown } = await import('@/hooks/useRealTimeCountdown');
    const future = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(); // 12h
    const { result } = renderHook(() => useRealTimeCountdown(future));
    expect(result.current.urgency).toBe('normal');
  });

  it('formatCountdownText returns text', async () => {
    const { formatCountdownText } = await import('@/hooks/useRealTimeCountdown');
    expect(formatCountdownText({ text: '5m 30s', seconds: 330, minutes: 5, hours: 0, isExpired: false, urgency: 'danger' })).toBe('5m 30s');
  });
});

// ===== useActionWithFeedback =====
describe('useActionWithFeedback', () => {
  it('executes action and returns data on success', async () => {
    const { useActionWithFeedback } = await import('@/hooks/useActionWithFeedback');
    const action = vi.fn().mockResolvedValue('result');
    const { result } = renderHook(() => useActionWithFeedback({ action }));
    
    expect(result.current.isLoading).toBe(false);
    
    let data: unknown;
    await act(async () => {
      data = await result.current.execute(undefined);
    });
    expect(data).toBe('result');
    expect(result.current.data).toBe('result');
    expect(result.current.error).toBeNull();
  });

  it('sets error state on failure', async () => {
    const { useActionWithFeedback } = await import('@/hooks/useActionWithFeedback');
    const action = vi.fn().mockRejectedValue(new Error('fail'));
    const { result } = renderHook(() => useActionWithFeedback({ action }));
    
    await act(async () => {
      try { await result.current.execute(undefined); } catch {}
    });
    expect(result.current.error?.message).toBe('fail');
    expect(result.current.data).toBeNull();
  });

  it('reset clears state', async () => {
    const { useActionWithFeedback } = await import('@/hooks/useActionWithFeedback');
    const action = vi.fn().mockResolvedValue('data');
    const { result } = renderHook(() => useActionWithFeedback({ action }));
    await act(async () => { await result.current.execute(undefined); });
    act(() => result.current.reset());
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('calls onSuccess callback', async () => {
    const onSuccess = vi.fn();
    const { useActionWithFeedback } = await import('@/hooks/useActionWithFeedback');
    const { result } = renderHook(() => useActionWithFeedback({ action: vi.fn().mockResolvedValue('ok'), onSuccess }));
    await act(async () => { await result.current.execute(undefined); });
    expect(onSuccess).toHaveBeenCalledWith('ok');
  });

  it('calls onError callback', async () => {
    const onError = vi.fn();
    const { useActionWithFeedback } = await import('@/hooks/useActionWithFeedback');
    const { result } = renderHook(() => useActionWithFeedback({ action: vi.fn().mockRejectedValue(new Error('e')), onError }));
    await act(async () => { try { await result.current.execute(undefined); } catch {} });
    expect(onError).toHaveBeenCalled();
  });
});

// ===== useRetryFetch =====
describe('useRetryFetch', () => {
  it('returns data on first success', async () => {
    const { useRetryFetch } = await import('@/hooks/useRetryFetch');
    const { result } = renderHook(() => useRetryFetch());
    const fetchFn = vi.fn().mockResolvedValue('data');
    
    let data: unknown;
    await act(async () => {
      data = await result.current.retryFetch(fetchFn, { maxRetries: 3, initialDelay: 10 });
    });
    expect(data).toBe('data');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and succeeds', async () => {
    const { useRetryFetch } = await import('@/hooks/useRetryFetch');
    const { result } = renderHook(() => useRetryFetch());
    const fetchFn = vi.fn()
      .mockRejectedValueOnce(new Error('fail1'))
      .mockResolvedValue('ok');
    
    let data: unknown;
    await act(async () => {
      data = await result.current.retryFetch(fetchFn, { maxRetries: 3, initialDelay: 10 });
    });
    expect(data).toBe('ok');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('throws after max retries', async () => {
    const { useRetryFetch } = await import('@/hooks/useRetryFetch');
    const { result } = renderHook(() => useRetryFetch());
    const fetchFn = vi.fn().mockRejectedValue(new Error('always fail'));
    
    await act(async () => {
      await expect(result.current.retryFetch(fetchFn, { maxRetries: 2, initialDelay: 10 })).rejects.toThrow('always fail');
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('respects shouldRetry predicate', async () => {
    const { useRetryFetch } = await import('@/hooks/useRetryFetch');
    const { result } = renderHook(() => useRetryFetch());
    const fetchFn = vi.fn().mockRejectedValue(new Error('no retry'));
    
    await act(async () => {
      await expect(result.current.retryFetch(fetchFn, {
        maxRetries: 3,
        initialDelay: 10,
        shouldRetry: () => false,
      })).rejects.toThrow('no retry');
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

// ===== useURLFilters =====
describe('useURLFilters', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={['/?tab=alerts&q=test']}>{children}</MemoryRouter>
  );

  it('reads filters from URL', async () => {
    const { useURLFilters } = await import('@/hooks/useURLFilters');
    const { result } = renderHook(() => useURLFilters(), { wrapper });
    expect(result.current.filters.tab).toBe('alerts');
    expect(result.current.filters.search).toBe('test');
  });

  it('defaults to agents tab', async () => {
    const emptyWrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter initialEntries={['/']}>{children}</MemoryRouter>
    );
    const { useURLFilters } = await import('@/hooks/useURLFilters');
    const { result } = renderHook(() => useURLFilters(), { wrapper: emptyWrapper });
    expect(result.current.filters.tab).toBe('agents');
    expect(result.current.filters.status).toBe('all');
  });
});

// ===== useSimplifiedMessage =====
describe('useSimplifiedMessage', () => {
  vi.mock('@/lib/leigo-translator', () => ({
    simplifyMessage: (m: string) => `simple:${m}`,
    formatErrorForUser: () => 'formatted error',
    translateTerm: (t: string) => `translated:${t}`,
    humanizeStatus: (s: string) => `human:${s}`,
    getFailureExplanation: (f: string) => `failure:${f}`,
    getAlertExplanation: (a: string) => `alert:${a}`,
  }));

  it('wraps all translator functions', async () => {
    const { useSimplifiedMessage } = await import('@/hooks/useSimplifiedMessage');
    const { result } = renderHook(() => useSimplifiedMessage());
    expect(result.current.simplify('test')).toBe('simple:test');
    expect(result.current.translate('term')).toBe('translated:term');
    expect(result.current.humanize('ok')).toBe('human:ok');
    expect(result.current.explainFailure('crash')).toBe('failure:crash');
    expect(result.current.explainAlert('high')).toBe('alert:high');
  });
});

// ===== usePushNotifications =====
describe('usePushNotifications', () => {
  it('returns isSupported based on Notification API', async () => {
    const { usePushNotifications } = await import('@/hooks/usePushNotifications');
    const { result } = renderHook(() => usePushNotifications());
    // jsdom may or may not have Notification
    expect(typeof result.current.isSupported).toBe('boolean');
    expect(typeof result.current.isGranted).toBe('boolean');
    expect(typeof result.current.requestPermission).toBe('function');
    expect(typeof result.current.showNotification).toBe('function');
  });
});
