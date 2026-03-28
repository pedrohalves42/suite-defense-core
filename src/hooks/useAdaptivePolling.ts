import { usePageVisibility } from './usePageVisibility';

/**
 * Returns an adaptive refetchInterval for React Query.
 * - Returns `false` when tab is hidden (pauses polling).
 * - Returns the base interval when visible.
 * 
 * Usage:
 *   const refetchInterval = useAdaptivePolling(300_000);
 *   useQuery({ ..., refetchInterval });
 */
export function useAdaptivePolling(baseIntervalMs: number): number | false {
  const isVisible = usePageVisibility();
  return isVisible ? baseIntervalMs : false;
}
