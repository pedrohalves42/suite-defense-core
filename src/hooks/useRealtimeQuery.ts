import { useEffect, useMemo } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { usePageVisibility } from './usePageVisibility';
import { logger } from '@/lib/logger';
import { realtimeChannelManager } from '@/lib/realtime-manager';

interface UseRealtimeQueryOptions<T> {
  queryKey: unknown[];
  queryFn: () => Promise<T>;
  realtimeTable?: string;
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
 */
export function useRealtimeQuery<T>({
  queryKey,
  queryFn,
  realtimeTable,
  realtimeFilter,
  realtimeEvents = DEFAULT_EVENTS,
  enabled = true,
  staleTime = 300_000,
}: UseRealtimeQueryOptions<T>) {
  const queryClient = useQueryClient();
  const isVisible = usePageVisibility();
  // PERF-FIX: Use a deep-stable hash for queryKey to avoid re-subscribing on array literals
  const queryKeyHash = useMemo(() => JSON.stringify(queryKey), [JSON.stringify(queryKey)]);
  const eventsHash = useMemo(() => realtimeEvents.join(','), [realtimeEvents]);

  useEffect(() => {
    if (!realtimeTable || !enabled || !isVisible) return;

    // Use a unique ID for this hook instance based on queryKeyHash and filter
    const subscriptionId = `hook-${realtimeTable}-${realtimeFilter || 'all'}-${queryKeyHash}`;

    realtimeChannelManager.subscribe(
      subscriptionId,
      realtimeTable,
      realtimeFilter,
      (payload) => {
        const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
        
        if (realtimeEvents.includes(eventType)) {
          logger.debug(`[useRealtimeQuery] Table ${realtimeTable} ${eventType}, invalidating ${queryKey[0]}`, {
            subscriptionId,
          });
          queryClient.invalidateQueries({ queryKey });
        }
      }
    );

    return () => {
      realtimeChannelManager.unsubscribe(subscriptionId, realtimeTable, realtimeFilter);
    };
  }, [realtimeTable, realtimeFilter, enabled, isVisible, queryClient, queryKeyHash, eventsHash, realtimeEvents]);

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
