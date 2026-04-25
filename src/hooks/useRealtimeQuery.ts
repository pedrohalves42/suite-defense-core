import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePageVisibility } from './usePageVisibility';
import { logger } from '@/lib/logger';
import type { RealtimeChannel } from '@supabase/supabase-js';

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
  const channelRef = useRef<RealtimeChannel | null>(null);

  // PERF-FIX: Use a deep-stable hash for queryKey to avoid re-subscribing on array literals
  const queryKeyHash = useMemo(() => JSON.stringify(queryKey), [JSON.stringify(queryKey)]);
  const eventsHash = useMemo(() => realtimeEvents.join(','), [realtimeEvents]);

  useEffect(() => {
    if (!realtimeTable || !enabled || !isVisible) return;

    const channelName = `rt-${realtimeTable}-${realtimeFilter || 'all'}-${queryKeyHash}`;

    // PERF-FIX: Get or create channel to avoid duplicate subscriptions in the same client
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: realtimeTable,
          filter: realtimeFilter,
        },
        (payload) => {
          const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
          // Use latest events from ref or eventsHash to verify
          if (realtimeEvents.includes(eventType)) {
            logger.debug(`[useRealtimeQuery] ${realtimeTable} ${eventType}, invalidating`, {
              queryKey: queryKey[0],
            });
            queryClient.invalidateQueries({ queryKey });
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          logger.debug(`[useRealtimeQuery] Subscribed to ${realtimeTable}`);
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [realtimeTable, realtimeFilter, enabled, isVisible, queryClient, queryKeyHash, eventsHash]);

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
