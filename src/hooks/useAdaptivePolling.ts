import { usePageVisibility } from './usePageVisibility';

/**
 * Returns an adaptive refetchInterval for React Query.
 staleTime: 2 * 60 * 1000,
 refetchOnWindowFocus: false,
 * - Returns `false` when tab is hidden (pauses polling).
 * - Returns the base interval when visible.
 * 
 * Usage:
 *   const refetchInterval = useAdaptivePolling(300_000);
 staleTime: 2 * 60 * 1000,
 refetchOnWindowFocus: false,
 *   useQuery({ ..., refetchInterval });
 staleTime: 2 * 60 * 1000,
 refetchOnWindowFocus: false,
 */
export function useAdaptivePolling(baseIntervalMs: number): number | false {
  const isVisible = usePageVisibility();
  return isVisible ? baseIntervalMs : false;
}
