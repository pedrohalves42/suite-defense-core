import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { usePageVisibility } from './usePageVisibility';
import { logger } from '@/lib/logger';
import { realtimeChannelManager } from '@/lib/realtime-manager';

/**
 * Throttle function to limit execution frequency
 */
function throttle(func: Function, limit: number) {
  let inThrottle: boolean;
  return function(this: any, ...args: any[]) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Basic matcher for PostgREST style filters (field=eq.value, field=neq.value)
 */
function matchesFilter(item: any, filter: string | undefined): boolean {
  if (!filter) return true;
  
  // Handle common format: "id=eq.123" or "status=eq.active"
  const parts = filter.split('=');
  if (parts.length !== 2) return true; // Complex filter, let it pass and let React Query handle it

  const field = parts[0];
  const condition = parts[1];

  if (condition.startsWith('eq.')) {
    const value = condition.substring(3);
    // Handle number strings
    const itemValue = String(item[field]);
    return itemValue === value;
  }

  if (condition.startsWith('neq.')) {
    const value = condition.substring(4);
    const itemValue = String(item[field]);
    return itemValue !== value;
  }

  return true; // Unknown filter type
}

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
  gcTime?: number;
  predicate?: (item: T) => boolean; // New: Client-side filter for incoming payloads
}

const DEFAULT_EVENTS: Array<'INSERT' | 'UPDATE' | 'DELETE'> = ['INSERT', 'UPDATE', 'DELETE'];

/**
 * Utility to hash query keys for stable comparisons
 */
function hashQueryKey(queryKey: any): string {
  if (Array.isArray(queryKey)) {
    return queryKey.map(k => (typeof k === 'object' && k !== null ? JSON.stringify(k) : String(k))).join('|');
  }
  return String(queryKey);
}

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
  gcTime,
  predicate,
}: UseRealtimeQueryOptions<T>) {
  const queryClient = useQueryClient();
  const isVisible = usePageVisibility();
  
  // ADR-026: Instance tracking for O(1) connection reference counting.
  // This ensures that multiple components using the same queryKey don't conflict
  // when unmounting (the manager uses this ID for reference counting).
  const instanceId = useRef(`hook-${Math.random().toString(36).substring(2, 9)}`).current;

  // Use a stable custom hash for queryKey to avoid re-subscribing on object literals inside arrays
  const queryKeyHash = useMemo(() => hashQueryKey(queryKey), [queryKey]);
  const eventsHash = useMemo(() => realtimeEvents.join(','), [realtimeEvents]);

  useEffect(() => {
    if (!realtimeTable || !enabled || !isVisible) return;

    logger.debug(`[useRealtimeQuery] Subscribing instance ${instanceId} to ${realtimeSchema}.${realtimeTable}`, {
      queryKey: queryKeyHash,
      filter: realtimeFilter
    });

    const handleRealtimeEvent = (payload: any) => {
      const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
      
      if (realtimeEvents.includes(eventType)) {
        logger.debug(`[useRealtimeQuery] ${realtimeTable} ${eventType}, applying optimistic update`, {
          instanceId,
          queryKey: queryKeyHash
        });
          
          if (eventType === 'UPDATE' && payload.new) {
            // Check if updated item still matches filter AND custom predicate
            const stillMatches = matchesFilter(payload.new, realtimeFilter) && (!predicate || predicate(payload.new));

            queryClient.setQueryData(queryKey, (oldData: any) => {
              if (!oldData) return oldData;
              
              const updateItem = (item: any) => 
                item.id === payload.new.id ? { ...item, ...payload.new } : item;

              const filterOutOfView = (item: any) => item.id !== payload.new.id;

              // 1. Array of objects
              if (Array.isArray(oldData)) {
                if (!stillMatches) return oldData.filter(filterOutOfView);
                return oldData.map(updateItem);
              }
              
              // 2. Paginated object or complex structure with .items or .data
              if (oldData.items && Array.isArray(oldData.items)) {
                if (!stillMatches) return { ...oldData, items: oldData.items.filter(filterOutOfView) };
                return { ...oldData, items: oldData.items.map(updateItem) };
              }
              if (oldData.data && Array.isArray(oldData.data)) {
                if (!stillMatches) return { ...oldData, data: oldData.data.filter(filterOutOfView) };
                return { ...oldData, data: oldData.data.map(updateItem) };
              }
              
              // 3. Single object
              if (oldData.id === payload.new.id) {
                if (!stillMatches) return null; // Or handle as needed
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
            // V-FIX: Verify item matches filter AND custom predicate before inserting into view
            if (!matchesFilter(payload.new, realtimeFilter) || (predicate && !predicate(payload.new))) {
              logger.debug(`[useRealtimeQuery] Skipping INSERT: item does not match filter`, {
                filter: realtimeFilter,
                itemId: payload.new.id
              });
              return;
            }

            queryClient.setQueryData(queryKey, (oldData: any) => {
              // V-FIX: If oldData is empty but we have a valid INSERT, initialize it as a single-item array
              // This fixes edge cases where realtime event arrives before initial fetch finishes
              if (!oldData) return [payload.new];
              // V-FIX: Ensure we are dealing with an array before checking exists
              const exists = (list: any) => Array.isArray(list) && list.some((item: any) => item.id === payload.new.id);

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
            // V-FIX: Safely check for data existence before invalidating to avoid unnecessary refetching
            const currentData = queryClient.getQueryData(queryKey);
            if (currentData !== undefined && currentData !== null) {
              queryClient.invalidateQueries({ queryKey, exact: true });
            }
          }
        }
      };

    realtimeChannelManager.subscribe(
      instanceId,
      realtimeTable,
      realtimeFilter,
      handleRealtimeEvent,
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
    predicate,
    realtimeEvents,
  ]);

  return useQuery({
    queryKey,
    queryFn,
    enabled: enabled,
    staleTime,
    gcTime,
    refetchInterval: false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: isVisible,
  });
}
