import { useSearchParams } from "react-router-dom";
import { useCallback, useMemo } from "react";

/**
 * Hook for persisting dashboard tab filters in URL query params.
 * Enables shareable filter states and browser back/forward navigation.
 */
export function useURLFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => ({
    tab: searchParams.get("tab") || "agents",
    search: searchParams.get("q") || "",
    status: searchParams.get("status") || "all",
  }), [searchParams]);

  const setFilter = useCallback((key: string, value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (!value || value === "all" || value === "") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setMultipleFilters = useCallback((updates: Record<string, string>) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      Object.entries(updates).forEach(([key, value]) => {
        if (!value || value === "all" || value === "") {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      });
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const clearFilters = useCallback(() => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  return { filters, setFilter, setMultipleFilters, clearFilters };
}
