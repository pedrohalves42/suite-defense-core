import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { usePageVisibility } from './usePageVisibility';
import { logger } from '@/lib/logger';
import { realtimeChannelManager } from '@/lib/realtime-manager';

interface UseRealtimeQueryOptions<T> {
  queryKey: unknown[];
  queryFn: () => Promise<T>;
  realtimeTable?: string;
  realtimeSchema?: string; // New option
  realtimeFilter?: string;
  realtimeEvents?: Array<'INSERT' | 'UPDATE' | 'DELETE'>;
  fallbackInterval?: number;
  enabled?: boolean;
  staleTime?: number;
  meta?: Record<string, unknown>;
}

const DEFAULT_EVENTS: Array<'INSERT' | 'UPDATE' | 'DELETE'> = ['INSERT', 'UPDATE', 'DELETE'];

/**
 * Combines React Query with Supabase Realtime subscriptions.
 * Reuses channels via RealtimeChannelManager.
 */
export function useRealtimeQuery<T>({
  queryKey,
  queryFn,
  realtimeTable,
  realtimeSchema = 'public',
  realtimeFilter,
  realtimeEvents = DEFAULT_EVENTS,
  enabled = true,
  staleTime = 300_000,
}: UseRealtimeQueryOptions<T>) {
  const queryClient = useQueryClient();
  const isVisible = usePageVisibility();
  
  // PERF-FIX: Use a unique ID for this specific hook instance
  // This ensures that multiple components using the same queryKey don't conflict
  // when unmounting (the manager uses this ID for reference counting).
  const instanceId = useRef(`hook-${Math.random().toString(36).substring(2, 9)}`).current;

  // Use a deep-stable hash for queryKey to avoid re-subscribing on array literals
  const queryKeyHash = useMemo(() => JSON.stringify(queryKey), [JSON.stringify(queryKey)]);
  const eventsHash = useMemo(() => realtimeEvents.join(','), [realtimeEvents]);

  useEffect(() => {
    if (!realtimeTable || !enabled || !isVisible) return;

    logger.debug(`[useRealtimeQuery] Subscribing instance ${instanceId} to ${realtimeSchema}.${realtimeTable}`, {
      queryKey: queryKey[0],
      filter: realtimeFilter
    });

    realtimeChannelManager.subscribe(
      instanceId,
      realtimeTable,
      realtimeFilter,
      (payload) => {
        const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
        
        if (realtimeEvents.includes(eventType)) {
          logger.debug(`[useRealtimeQuery] ${realtimeTable} ${eventType}, invalidating ${queryKey[0]}`, {
            instanceId,
          });
          queryClient.invalidateQueries({ queryKey });
        }
      },
      realtimeSchema
    );

    return () => {
      logger.debug(`[useRealtimeQuery] Unsubscribing instance ${instanceId} from ${realtimeSchema}.${realtimeTable}`);
      realtimeChannelManager.unsubscribe(instanceId, realtimeTable, realtimeFilter, realtimeSchema);
    };
  }, [
    instanceId,
    realtimeTable,
    realtimeSchema,
    realtimeFilter,
    enabled,
    isVisible,
    queryClient,
    queryKeyHash,
    eventsHash,
    realtimeEvents
  ]);

  return useQuery({
    queryKey,
    queryFn,
    enabled,
    staleTime,
    refetchInterval: false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}
