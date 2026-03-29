/**
 * COST-OPT-V9: Polling completely disabled to reduce Cloud costs.
 * All 104 files that call this hook now get `false` (no polling).
 * Use refetchOnWindowFocus or manual refetch() instead.
 * Only useSubscription.tsx retains its own polling interval.
 */
export function useAdaptivePolling(_baseIntervalMs: number): false {
  return false;
}
