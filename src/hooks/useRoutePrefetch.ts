import { useCallback } from 'react';
import { logger } from '@/lib/logger';

/**
 * Hook to prefetch lazy-loaded routes/components
 */
export function useRoutePrefetch() {
  const prefetch = useCallback((importFn: () => Promise<unknown>) => {
    const promise = importFn();
    promise.catch((err) => {
      logger.warn('[useRoutePrefetch] Failed to prefetch route', { err });
    });
  }, []);

  return prefetch;
}
