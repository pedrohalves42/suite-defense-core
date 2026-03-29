import { usePageVisibility } from './usePageVisibility';

/**
 * Returns an adaptive refetchInterval for React Query.
 * - Returns `false` when tab is hidden (pauses polling completely).
 * - Enforces a minimum interval of 30 minutes for cost optimization (COST-OPT-V8).
 * - For intervals >= 60 min, uses the requested value as-is.
 * 
 * COST-OPT-V8: Increased from 10min to 30min minimum to reduce cloud spend.
 * All real-time needs should use useRealtimeQuery with Supabase Realtime instead of polling.
 */
const MIN_INTERVAL_MS = 1_800_000; // 30 minutes — COST-OPT-V8

export function useAdaptivePolling(baseIntervalMs: number): number | false {
  const isVisible = usePageVisibility();
  const interval = Math.max(baseIntervalMs, MIN_INTERVAL_MS);
  return isVisible ? interval : false;
}
