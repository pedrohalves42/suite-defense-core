import { useEffect, useRef } from 'react';
import { useQueryClient, UseQueryOptions, useQuery } from '@tanstack/react-query';
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
  /** Fallback polling interval when page is visible (ms). Default: 300_000 (5min) */
  fallbackInterval?: number;
  /** Whether query is enabled */
  enabled?: boolean;
  /** Stale time for react-query */
  staleTime?: number;
  /** Additional react-query options */
  meta?: Record<string, unknown>;
}

/**
 * Combines React Query with Supabase Realtime subscriptions.
 * 
 * When the table has Realtime enabled, invalidates query on changes.
 * Falls back to adaptive polling (paused when tab not visible).
 */
export function useRealtimeQuery<T>({
  queryKey,
  queryFn,
  realtimeTable,
  realtimeFilter,
  realtimeEvents = ['INSERT', 'UPDATE', 'DELETE'],
  fallbackInterval = 300_000,
  enabled = true,
  staleTime = 30_000,
}: UseRealtimeQueryOptions<T>) {
  const queryClient = useQueryClient();
  const isVisible = usePageVisibility();
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Subscribe to realtime changes
  useEffect(() => {
    if (!realtimeTable || !enabled) return;

    const channelName = `rt-${realtimeTable}-${realtimeFilter || 'all'}-${queryKey.join('-')}`;
    
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
          const eventType = payload.eventType;
          if (realtimeEvents.includes(eventType as 'INSERT' | 'UPDATE' | 'DELETE')) {
            logger.debug(`[useRealtimeQuery] ${realtimeTable} ${eventType}, invalidating`, { queryKey: queryKey[0] });
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
  }, [realtimeTable, realtimeFilter, enabled, queryClient, ...queryKey]);

  // Use adaptive polling: only poll when visible and no realtime
  const effectiveInterval = isVisible ? fallbackInterval : false;

  return useQuery({
    queryKey,
    queryFn,
    enabled,
    staleTime,
    refetchInterval: realtimeTable ? false : effectiveInterval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}
