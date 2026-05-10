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
  
  // ADR-026: Instance tracking for O(1) connection reference counting.
  // This ensures that multiple components using the same queryKey don't conflict
  // when unmounting (the manager uses this ID for reference counting).
  const instanceId = useRef(`hook-${Math.random().toString(36).substring(2, 9)}`).current;

  // Use a stable hash for queryKey to avoid re-subscribing on array literals
  const queryKeyHash = useMemo(() => JSON.stringify(queryKey), [queryKey]);
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
          logger.debug(`[useRealtimeQuery] ${realtimeTable} ${eventType}, applying optimistic update for ${queryKey[0]}`, {
            instanceId,
          });
          
          if (eventType === 'UPDATE' && payload.new) {
            queryClient.setQueryData(queryKey, (oldData: any) => {
              if (!oldData) return oldData;
              
              const updateItem = (item: any) => 
                item.id === payload.new.id ? { ...item, ...payload.new } : item;

              // 1. Array of objects
              if (Array.isArray(oldData)) {
                return oldData.map(updateItem);
              }
              
              // 2. Paginated object or complex structure with .items or .data
              if (oldData.items && Array.isArray(oldData.items)) {
                return { ...oldData, items: oldData.items.map(updateItem) };
              }
              if (oldData.data && Array.isArray(oldData.data)) {
                return { ...oldData, data: oldData.data.map(updateItem) };
              }
              
              // 3. Single object
              if (oldData.id === payload.new.id) {
                return { ...oldData, ...payload.new };
              }
              
              return oldData;
            });
          } else if (eventType === 'DELETE' && payload.old) {
            queryClient.setQueryData(queryKey, (oldData: any) => {
              if (!oldData) return oldData;
              const filterItem = (item: any) => item.id !== payload.old.id;

              if (Array.isArray(oldData)) return oldData.filter(filterItem);
              if (oldData.items && Array.isArray(oldData.items)) return { ...oldData, items: oldData.items.filter(filterItem) };
              if (oldData.data && Array.isArray(oldData.data)) return { ...oldData, data: oldData.data.filter(filterItem) };
              
              return oldData;
            });
          } else if (eventType === 'INSERT' && payload.new) {
            queryClient.setQueryData(queryKey, (oldData: any) => {
              if (!oldData) return oldData;
              const exists = (list: any[]) => list.some((item: any) => item.id === payload.new.id);

              if (Array.isArray(oldData)) {
                if (exists(oldData)) return oldData;
                return [payload.new, ...oldData];
              }
              if (oldData.items && Array.isArray(oldData.items)) {
                if (exists(oldData.items)) return oldData;
                return { ...oldData, items: [payload.new, ...oldData.items] };
              }
              if (oldData.data && Array.isArray(oldData.data)) {
                if (exists(oldData.data)) return oldData;
                return { ...oldData, data: [payload.new, ...oldData.data] };
              }
              return oldData;
            });
          } else {
            // Fallback for complex structures
            queryClient.invalidateQueries({ queryKey });
          }
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
    eventsHash
  ]);

  return useQuery({
    queryKey,
    queryFn,
    enabled: enabled,
    staleTime,
    refetchInterval: false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: isVisible,
  });
}
