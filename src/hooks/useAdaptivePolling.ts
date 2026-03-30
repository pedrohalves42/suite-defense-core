import { usePageVisibility } from './usePageVisibility';

/**
 * Adaptive polling hook: returns the polling interval (ms) when the tab
 * is visible, or `false` when hidden to save Cloud costs.
 * Enforces a minimum of 120 000 ms (2 min) to keep costs low.
 */
export function useAdaptivePolling(baseIntervalMs: number): number | false {
  const isVisible = usePageVisibility();
  if (!isVisible) return false;
  return Math.max(baseIntervalMs, 120_000);
}
