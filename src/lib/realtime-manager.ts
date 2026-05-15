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

export type ChannelStatus = 'idle' | 'subscribing' | 'subscribed' | 'error' | 'timeout' | 'retrying';

export interface ChannelDiagnostic {
  key: string;
  schema: string;
  table: string;
  filter?: string;
  status: ChannelStatus;
  subscribers: string[];
  errorCount: number;
  lastError?: { ts: string; message: string };
  lastSubscribedAt?: string;
  retryAttempt: number;
  nextRetryAt?: string;
}

interface ChannelMeta extends ChannelDiagnostic {
  retryTimer?: ReturnType<typeof setTimeout>;
}

const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30_000;

/**
 * RealtimeChannelManager handles Supabase Realtime connections centrally.
 * V-DIAG: Tracks per-channel diagnostics and applies exponential backoff
 * with jitter when channels enter ERROR/TIMED_OUT states.
 */
class RealtimeChannelManager {
  private static instance: RealtimeChannelManager;
  private channels: Map<string, RealtimeChannel> = new Map();
  private subscribers: Map<string, Subscription[]> = new Map();
  private meta: Map<string, ChannelMeta> = new Map();

  private constructor() {}

  public static getInstance(): RealtimeChannelManager {
    if (!RealtimeChannelManager.instance) {
      RealtimeChannelManager.instance = new RealtimeChannelManager();
    }
    return RealtimeChannelManager.instance;
  }

  public subscribe(
    id: string,
    table: string,
    filter: string | undefined,
    callback: EventCallback,
    schema: string = 'public',
    tenantId?: string // Correção F-003
  ): void {
    const channelKey = this.getChannelKey(schema, table, filter, tenantId);
    const currentSubscribers = this.subscribers.get(channelKey) || [];

    if (currentSubscribers.some((s) => s.id === id)) {
      logger.log('debug', 'realtime', `ID ${id} already subscribed to ${channelKey}`);
      return;
    }

    currentSubscribers.push({ id, schema, table, filter, callback });
    this.subscribers.set(channelKey, currentSubscribers);

    if (!this.channels.has(channelKey)) {
      this.initChannel(channelKey, schema, table, filter);
    } else {
      logger.log('debug', 'realtime', `Reusing channel ${channelKey}`, {
        subscribers: currentSubscribers.length,
      });
      const m = this.meta.get(channelKey);
      if (m) m.subscribers = currentSubscribers.map((s) => s.id);
    }
  }

  public unsubscribe(id: string, table: string, filter?: string, schema: string = 'public', tenantId?: string): void {
    const channelKey = this.getChannelKey(schema, table, filter, tenantId);
    const currentSubscribers = this.subscribers.get(channelKey) || [];
    const filteredSubscribers = currentSubscribers.filter((s) => s.id !== id);

    if (filteredSubscribers.length === 0) {
      if (currentSubscribers.length > 0) {
        this.cleanupChannel(channelKey);
      }
      this.subscribers.delete(channelKey);
      this.meta.delete(channelKey);
    } else {
      this.subscribers.set(channelKey, filteredSubscribers);
      const m = this.meta.get(channelKey);
      if (m) m.subscribers = filteredSubscribers.map((s) => s.id);
      logger.log('debug', 'realtime', `Unsubscribed ${id} from ${channelKey}`, {
        remaining: filteredSubscribers.length,
      });
    }
  }

  /** V-DIAG: Snapshot of all channels and their health metrics. */
  public getDiagnostics(): ChannelDiagnostic[] {
    return Array.from(this.meta.values()).map(({ retryTimer: _t, ...rest }) => rest);
  }

  /** V-DIAG: Force a channel to reset and reconnect. */
  public forceReconnect(channelKey: string): boolean {
    const m = this.meta.get(channelKey);
    if (!m) return false;
    if (m.retryTimer) {
      clearTimeout(m.retryTimer);
      m.retryTimer = undefined;
    }
    m.retryAttempt = 0;
    m.nextRetryAt = undefined;
    this.cleanupChannel(channelKey);
    this.initChannel(channelKey, m.schema, m.table, m.filter);
    return true;
  }

  private getChannelKey(schema: string, table: string, filter?: string): string {
    return `${schema}:${table}${filter ? `:${filter}` : ''}`;
  }

  private getSafeChannelName(key: string): string {
    return `central-${key.replace(/[^a-zA-Z0-9:._-]/g, '_')}`.substring(0, 100);
  }

  private ensureMeta(key: string, schema: string, table: string, filter?: string): ChannelMeta {
    let m = this.meta.get(key);
    if (!m) {
      m = {
        key,
        schema,
        table,
        filter,
        status: 'idle',
        subscribers: [],
        errorCount: 0,
        retryAttempt: 0,
      };
      this.meta.set(key, m);
    }
    return m;
  }

  private emitGlobalError(key: string, message: string) {
    if (typeof window === 'undefined') return;
    try {
      window.dispatchEvent(
        new CustomEvent('cybershield:realtime-error', { detail: { channelKey: key, message } })
      );
    } catch { /* noop */ }
  }

  private scheduleRetry(key: string) {
    const m = this.meta.get(key);
    if (!m) return;
    if (m.retryTimer) return;
    m.retryAttempt += 1;
    const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (m.retryAttempt - 1)) + Math.random() * 500;
    m.status = 'retrying';
    m.nextRetryAt = new Date(Date.now() + delay).toISOString();
    logger.log('warn', 'realtime', `Scheduling retry for ${key}`, {
      attempt: m.retryAttempt,
      delayMs: Math.round(delay),
    });
    m.retryTimer = setTimeout(() => {
      m.retryTimer = undefined;
      // Only retry if we still have subscribers
      const subs = this.subscribers.get(key);
      if (!subs || subs.length === 0) return;
      this.initChannel(key, m.schema, m.table, m.filter);
    }, delay);
  }

  private initChannel(key: string, schema: string, table: string, filter?: string): void {
    if (this.channels.has(key)) return;

    const m = this.ensureMeta(key, schema, table, filter);
    m.status = 'subscribing';
    m.subscribers = (this.subscribers.get(key) || []).map((s) => s.id);

    logger.log('info', 'realtime', `Initializing channel ${key}`);

    const channelName = this.getSafeChannelName(key);
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema, table, filter },
        (payload) => {
          logger.log('debug', 'realtime', `Event on ${key}: ${payload.eventType}`);
          const subs = this.subscribers.get(key) || [];
          subs.forEach((s) => {
            try { s.callback(payload); } catch (err) {
              logger.log('error', 'realtime', `Subscriber callback failed for ${key}`, {
                subscriberId: s.id,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          });
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          m.status = 'subscribed';
          m.lastSubscribedAt = new Date().toISOString();
          m.retryAttempt = 0;
          m.nextRetryAt = undefined;
          logger.log('info', 'realtime', `Channel ${key} subscribed`);
        } else if (status === 'CHANNEL_ERROR') {
          const message = err instanceof Error ? err.message : String(err ?? 'unknown channel error');
          m.status = 'error';
          m.errorCount += 1;
          m.lastError = { ts: new Date().toISOString(), message };
          logger.log('error', 'realtime', `Channel ${key} error`, { message });
          this.emitGlobalError(key, message);
          this.cleanupChannel(key);
          this.scheduleRetry(key);
        } else if (status === 'TIMED_OUT') {
          m.status = 'timeout';
          m.errorCount += 1;
          m.lastError = { ts: new Date().toISOString(), message: 'subscription timed out' };
          logger.log('warn', 'realtime', `Channel ${key} timed out`);
          this.emitGlobalError(key, 'timed out');
          this.cleanupChannel(key);
          this.scheduleRetry(key);
        }
      });

    this.channels.set(key, channel);
  }

  private cleanupChannel(key: string): void {
    const channel = this.channels.get(key);
    if (channel) {
      logger.log('info', 'realtime', `Removing channel ${key}`);
      const promise = supabase.removeChannel(channel);
      if (promise && typeof promise.catch === 'function') {
        promise.catch((err) => {
          logger.log('error', 'realtime', `Error removing channel ${key}`, {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
      this.channels.delete(key);
    }
  }
}

export const realtimeChannelManager = RealtimeChannelManager.getInstance();
