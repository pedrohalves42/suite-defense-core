import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { usePageVisibility } from './usePageVisibility';
import { logger } from '@/lib/logger';
import { realtimeChannelManager } from '@/lib/realtime-manager';

/**
 * Throttle function to limit execution frequency
 */
type AnyFn = (...args: unknown[]) => void;
function throttle<T extends AnyFn>(func: T, limit: number): T {
  let inThrottle = false;
  return (function (this: unknown, ...args: unknown[]) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => { inThrottle = false; }, limit);
    }
  }) as T;
}

type RealtimeRecord = Record<string, unknown> & { id?: string | number };
type RealtimePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new?: RealtimeRecord;
  old?: RealtimeRecord;
};

/**
 * Basic matcher for PostgREST style filters (field=eq.value, field=neq.value)
 */
function matchesFilter(item: RealtimeRecord, filter: string | undefined): boolean {
  if (!filter) return true;

  // Handle common format: "id=eq.123" or "status=eq.active"
  const parts = filter.split('=');
  if (parts.length !== 2) return true; // Complex filter, let it pass and let React Query handle it

  const field = parts[0];
  const condition = parts[1];

  if (condition.startsWith('eq.')) {
    const value = condition.substring(3);
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
  realtimeSchema?: string;
  realtimeFilter?: string;
  tenantId?: string; // Correção F-003: Prefixo de tenant obrigatório para canais
  realtimeEvents?: Array<'INSERT' | 'UPDATE' | 'DELETE'>;
  fallbackInterval?: number;
  enabled?: boolean;
  staleTime?: number;
  meta?: Record<string, unknown>;
  gcTime?: number;
  predicate?: (item: T) => boolean;
}

const DEFAULT_EVENTS: Array<'INSERT' | 'UPDATE' | 'DELETE'> = ['INSERT', 'UPDATE', 'DELETE'];

/**
 * Utility to hash query keys for stable comparisons
 */
function hashQueryKey(queryKey: unknown): string {
  if (Array.isArray(queryKey)) {
    return queryKey.map((k) => (typeof k === 'object' && k !== null ? JSON.stringify(k) : String(k))).join('|');
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
  tenantId,
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

  // P0-Q1 (Rules of Hooks): throttled invalidator must live at hook root, not inside useEffect.
  // Previously throttle state was reset on every re-subscribe (effectively disabled).
  const throttledInvalidate = useMemo(
    () =>
      throttle((...args: unknown[]) => {
        const key = args[0] as unknown[];
        logger.debug(`[useRealtimeQuery] Throttled invalidation for ${realtimeTable}`, { queryKey: key });
        queryClient.invalidateQueries({ queryKey: key, exact: true });
      }, 1000),
    [queryClient, realtimeTable]
  );

  useEffect(() => {
    if (!realtimeTable || !enabled || !isVisible) return;

    // Correção F-003: Prefixo de tenant obrigatório para canais (Isolation Enforcement)
    const channelName = tenantId ? `tenant:${tenantId}:${realtimeTable}` : `public:${realtimeTable}`;

    logger.debug(`[useRealtimeQuery] Subscribing instance ${instanceId} to channel ${channelName}`, {
      queryKey: queryKeyHash,
      filter: realtimeFilter
    });

    const handleRealtimeEvent = (payload: RealtimePayload) => {
      const eventType = payload.eventType;

      if (realtimeEvents.includes(eventType)) {
          if (eventType === 'UPDATE' && payload.new) {
            const newRow = payload.new as RealtimeRecord;
            const stillMatches = matchesFilter(newRow, realtimeFilter) && (!predicate || predicate(newRow as unknown as T));

            queryClient.setQueryData(queryKey, (oldData: unknown) => {
              if (!oldData) return oldData;

              const updateItem = (item: RealtimeRecord) =>
                item.id === newRow.id ? { ...item, ...newRow } : item;

              const filterOutOfView = (item: RealtimeRecord) => item.id !== newRow.id;

              if (Array.isArray(oldData)) {
                if (!stillMatches) return (oldData as RealtimeRecord[]).filter(filterOutOfView);
                return (oldData as RealtimeRecord[]).map(updateItem);
              }

              const oldObj = oldData as { items?: RealtimeRecord[]; data?: RealtimeRecord[]; id?: unknown };

              if (oldObj.items && Array.isArray(oldObj.items)) {
                if (!stillMatches) return { ...oldObj, items: oldObj.items.filter(filterOutOfView) };
                return { ...oldObj, items: oldObj.items.map(updateItem) };
              }
              if (oldObj.data && Array.isArray(oldObj.data)) {
                if (!stillMatches) return { ...oldObj, data: oldObj.data.filter(filterOutOfView) };
                return { ...oldObj, data: oldObj.data.map(updateItem) };
              }

              if (oldObj.id === newRow.id) {
                if (!stillMatches) return null;
                return { ...oldObj, ...newRow };
              }

              return oldData;
            });
          } else if (eventType === 'DELETE' && payload.old) {
            const oldRow = payload.old as RealtimeRecord;
            queryClient.setQueryData(queryKey, (oldData: unknown) => {
              if (!oldData) return oldData;
              const filterItem = (item: RealtimeRecord) => item.id !== oldRow.id;

              if (Array.isArray(oldData)) return (oldData as RealtimeRecord[]).filter(filterItem);
              const oldObj = oldData as { items?: RealtimeRecord[]; data?: RealtimeRecord[] };
              if (oldObj.items && Array.isArray(oldObj.items)) return { ...oldObj, items: oldObj.items.filter(filterItem) };
              if (oldObj.data && Array.isArray(oldObj.data)) return { ...oldObj, data: oldObj.data.filter(filterItem) };

              return oldData;
            });
          } else if (eventType === 'INSERT' && payload.new) {
            const newRow = payload.new as RealtimeRecord;
            if (!matchesFilter(newRow, realtimeFilter) || (predicate && !predicate(newRow as unknown as T))) {
              logger.debug(`[useRealtimeQuery] Skipping INSERT: item does not match filter`, {
                filter: realtimeFilter,
                itemId: newRow.id,
              });
              return;
            }

            queryClient.setQueryData(queryKey, (oldData: unknown) => {
              if (!oldData) return [newRow];
              const exists = (list: unknown) =>
                Array.isArray(list) && (list as RealtimeRecord[]).some((item) => item.id === newRow.id);

              if (Array.isArray(oldData)) {
                if (exists(oldData)) return oldData;
                return [newRow, ...(oldData as RealtimeRecord[])];
              }
              const oldObj = oldData as { items?: RealtimeRecord[]; data?: RealtimeRecord[] };
              if (oldObj.items && Array.isArray(oldObj.items)) {
                if (exists(oldObj.items)) return oldData;
                return { ...oldObj, items: [newRow, ...oldObj.items] };
              }
              if (oldObj.data && Array.isArray(oldObj.data)) {
                if (exists(oldObj.data)) return oldData;
                return { ...oldObj, data: [newRow, ...oldObj.data] };
              }
              return oldData;
            });
          } else {
            const currentData = queryClient.getQueryData(queryKey);
            if (currentData !== undefined && currentData !== null) {
              throttledInvalidate(queryKey);
            }
          }
        }
      };

    realtimeChannelManager.subscribe(
      instanceId,
      realtimeTable,
      realtimeFilter,
      handleRealtimeEvent,
      realtimeSchema,
      tenantId // Passando o tenantId para o manager
    );

    return () => {
      logger.debug(`[useRealtimeQuery] Unsubscribing instance ${instanceId} from ${realtimeSchema}.${realtimeTable}`);
      realtimeChannelManager.unsubscribe(instanceId, realtimeTable, realtimeFilter, realtimeSchema, tenantId);
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
