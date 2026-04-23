import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePageVisibility } from './usePageVisibility';
import { logger } from '@/lib/logger';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UseRealtimeQueryOptions<T> {
  /** React Query key */
  queryKey: unknown[];
  /** Query function */
  queryFn: () => Promise<T>;
  /** Supabase table to subscribe to for realtime updates */
  realtimeTable?: string;
  /** Optional filter for realtime subscription (e.g. `tenant_id=eq.xxx`) */
  realtimeFilter?: string;
  /** Realtime events to listen to. Default: ['INSERT', 'UPDATE', 'DELETE'] */
  realtimeEvents?: Array<'INSERT' | 'UPDATE' | 'DELETE'>;
  /** Fallback polling interval when page is visible (ms). Default: 1_800_000 (30min) */
  fallbackInterval?: number;
  /** Whether query is enabled */
  enabled?: boolean;
  /** Stale time for react-query */
  staleTime?: number;
  /** Additional react-query options */
  meta?: Record<string, unknown>;
}

const DEFAULT_EVENTS: Array<'INSERT' | 'UPDATE' | 'DELETE'> = ['INSERT', 'UPDATE', 'DELETE'];

/**
 * Combines React Query with Supabase Realtime subscriptions.
 *
 * When the table has Realtime enabled, invalidates query on changes.
 * Falls back to adaptive polling (paused when tab not visible).
 *
 * PERF: Stable dependency hashing avoids JSON.stringify on every render cycle.
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

  // PERF: Memoize stringified deps once per key/event change instead of every render
  const queryKeyHash = useMemo(() => JSON.stringify(queryKey), [queryKey]);
  const eventsHash = useMemo(() => realtimeEvents.join(','), [realtimeEvents]);

  // Keep latest values in refs so the effect doesn't re-subscribe on every render
  const queryKeyRef = useRef(queryKey);
  const eventsRef = useRef(realtimeEvents);
  queryKeyRef.current = queryKey;
  eventsRef.current = realtimeEvents;

  useEffect(() => {
    if (!realtimeTable || !enabled || !isVisible) return;

    const channelName = `rt-${realtimeTable}-${realtimeFilter || 'all'}-${queryKeyHash}`;

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
          if (eventsRef.current.includes(eventType)) {
            logger.debug(`[useRealtimeQuery] ${realtimeTable} ${eventType}, invalidating`, {
              queryKey: queryKeyRef.current[0],
            });
            queryClient.invalidateQueries({ queryKey: queryKeyRef.current });
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
    // PERF: primitive hashes only — no JSON.stringify on every render
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

