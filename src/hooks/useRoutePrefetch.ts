import { useCallback } from 'react';

/**
 * Hook to prefetch lazy-loaded routes/components
 */
export function useRoutePrefetch() {
  const prefetch = useCallback((importFn: () => Promise<any>) => {
    // Start loading the component in the background
    const promise = importFn();
    
    // Optional: add to a global cache if needed, 
    // but just calling the import starts the network fetch.
    promise.catch(err => {
      console.warn('[useRoutePrefetch] Failed to prefetch route', err);
    });
  }, []);

  return prefetch;
}
