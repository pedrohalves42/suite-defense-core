
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { RealtimeChannel } from '@supabase/supabase-js';

type EventCallback = (payload: any) => void;

interface Subscription {
  id: string;
  schema: string;
  table: string;
  filter?: string;
  callback: EventCallback;
}

/**
 * RealtimeChannelManager handles Supabase Realtime connections centrally.
 * It reuses a single channel per table (and optionally filter) to avoid
 * exceeding the maximum number of concurrent connections.
 */
class RealtimeChannelManager {
  private static instance: RealtimeChannelManager;
  private channels: Map<string, RealtimeChannel> = new Map();
  private subscribers: Map<string, Subscription[]> = new Map();

  private constructor() {}

  public static getInstance(): RealtimeChannelManager {
    if (!RealtimeChannelManager.instance) {
      RealtimeChannelManager.instance = new RealtimeChannelManager();
    }
    return RealtimeChannelManager.instance;
  }

  /**
   * Subscribe to changes on a specific table.
   * Reuses existing channel if available.
   */
  public subscribe(
    id: string,
    table: string,
    filter: string | undefined,
    callback: EventCallback
  ): void {
    const channelKey = this.getChannelKey(table, filter);
    
    // Track the subscriber
    const currentSubscribers = this.subscribers.get(channelKey) || [];
    if (currentSubscribers.some(s => s.id === id)) return;
    
    currentSubscribers.push({ id, table, filter, callback });
    this.subscribers.set(channelKey, currentSubscribers);

    // Create or reuse channel
    if (!this.channels.has(channelKey)) {
      this.initChannel(channelKey, table, filter);
    }
  }

  /**
   * Unsubscribe from changes. 
   * Removes the channel if no more subscribers are left.
   */
  public unsubscribe(id: string, table: string, filter?: string): void {
    const channelKey = this.getChannelKey(table, filter);
    const currentSubscribers = this.subscribers.get(channelKey) || [];
    
    const filteredSubscribers = currentSubscribers.filter(s => s.id !== id);
    
    if (filteredSubscribers.length === 0) {
      this.cleanupChannel(channelKey);
      this.subscribers.delete(channelKey);
    } else {
      this.subscribers.set(channelKey, filteredSubscribers);
    }
  }

  private getChannelKey(table: string, filter?: string): string {
    return `${table}${filter ? `:${filter}` : ''}`;
  }

  private initChannel(key: string, table: string, filter?: string): void {
    logger.debug(`[RealtimeChannelManager] Initializing channel for ${key}`);
    
    const channel = supabase
      .channel(`central-${key}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: table,
          filter: filter,
        },
        (payload) => {
          logger.debug(`[RealtimeChannelManager] Event on ${key}: ${payload.eventType}`);
          const subs = this.subscribers.get(key) || [];
          subs.forEach(s => s.callback(payload));
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          logger.debug(`[RealtimeChannelManager] Channel ${key} subscribed`);
        }
      });

    this.channels.set(key, channel);
  }

  private cleanupChannel(key: string): void {
    const channel = this.channels.get(key);
    if (channel) {
      logger.debug(`[RealtimeChannelManager] Removing channel ${key} (no more subscribers)`);
      supabase.removeChannel(channel);
      this.channels.delete(key);
    }
  }
}

export const realtimeChannelManager = RealtimeChannelManager.getInstance();
