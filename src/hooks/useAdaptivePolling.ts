import { usePageVisibility } from './usePageVisibility';

/**
 * Returns an adaptive refetchInterval for React Query.
 * - Returns `false` when tab is hidden (pauses polling).
 * - Enforces a minimum interval of 600_000ms (10 min) for cost optimization (COST-OPT-V7).
 * - Returns the base interval (clamped) when visible.
 * 
 * Usage:
 *   const refetchInterval = useAdaptivePolling(600_000);
 *   useQuery({ ..., refetchInterval });
 */
const MIN_INTERVAL_MS = 600_000; // 10 minutes — COST-OPT-V7

export function useAdaptivePolling(baseIntervalMs: number): number | false {
  const isVisible = usePageVisibility();
  const interval = Math.max(baseIntervalMs, MIN_INTERVAL_MS);
  return isVisible ? interval : false;
}
