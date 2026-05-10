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
 * It reuses a single channel per table/schema (and optionally filter) to avoid
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
    callback: EventCallback,
    schema: string = 'public'
  ): void {
    const channelKey = this.getChannelKey(schema, table, filter);
    
    // Track the subscriber
    const currentSubscribers = this.subscribers.get(channelKey) || [];
    
    // Check if this specific instance ID is already registered to avoid duplicates
    if (currentSubscribers.some(s => s.id === id)) {
      logger.debug(`[RealtimeChannelManager] ID ${id} already subscribed to ${channelKey}`);
      return;
    }
    
    currentSubscribers.push({ id, schema, table, filter, callback });
    this.subscribers.set(channelKey, currentSubscribers);

    // Create or reuse channel
    if (!this.channels.has(channelKey)) {
      this.initChannel(channelKey, schema, table, filter);
    } else {
      logger.debug(`[RealtimeChannelManager] Reusing channel for ${channelKey}. Total subscribers: ${currentSubscribers.length}`);
    }
  }

  /**
   * Unsubscribe from changes. 
   * Removes the channel if no more subscribers are left.
   */
  public unsubscribe(id: string, table: string, filter?: string, schema: string = 'public'): void {
    const channelKey = this.getChannelKey(schema, table, filter);
    const currentSubscribers = this.subscribers.get(channelKey) || [];
    
    const filteredSubscribers = currentSubscribers.filter(s => s.id !== id);
    
    if (filteredSubscribers.length === 0) {
      if (currentSubscribers.length > 0) {
        this.cleanupChannel(channelKey);
      }
      this.subscribers.delete(channelKey);
    } else {
      this.subscribers.set(channelKey, filteredSubscribers);
      logger.debug(`[RealtimeChannelManager] Unsubscribed ${id} from ${channelKey}. Remaining: ${filteredSubscribers.length}`);
    }
  }

  private getChannelKey(schema: string, table: string, filter?: string): string {
    return `${schema}:${table}${filter ? `:${filter}` : ''}`;
  }

  private getSafeChannelName(key: string): string {
    // Supabase channel names should be alphanumeric or : . _ -
    // and definitely no special characters from filters
    return `central-${key.replace(/[^a-zA-Z0-9:._-]/g, '_')}`.substring(0, 100);
  }

  private initChannel(key: string, schema: string, table: string, filter?: string): void {
    if (this.channels.has(key)) return;

    logger.debug(`[RealtimeChannelManager] Initializing channel for ${key}`);
    
    const channelName = this.getSafeChannelName(key);
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: schema,
          table: table,
          filter: filter,
        },
        (payload) => {
          logger.debug(`[RealtimeChannelManager] Event on ${key}: ${payload.eventType}`);
          const subs = this.subscribers.get(key) || [];
          subs.forEach(s => s.callback(payload));
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          logger.debug(`[RealtimeChannelManager] Channel ${key} subscribed`);
        } else if (status === 'CHANNEL_ERROR') {
          logger.error(`[RealtimeChannelManager] Channel ${key} error:`, err);
          // V-FIX: Cleanup and allow retry on next check
          this.channels.delete(key);
        } else if (status === 'TIMED_OUT') {
          logger.warn(`[RealtimeChannelManager] Channel ${key} timed out`);
          this.channels.delete(key);
        }
      });

    this.channels.set(key, channel);
  }

  private cleanupChannel(key: string): void {
    const channel = this.channels.get(key);
    if (channel) {
      logger.info(`[RealtimeChannelManager] Removing channel ${key} (no more subscribers)`);
      supabase.removeChannel(channel).catch(err => {
        logger.error(`[RealtimeChannelManager] Error removing channel ${key}`, err);
      });
      this.channels.delete(key);
    }
  }
}

export const realtimeChannelManager = RealtimeChannelManager.getInstance();
