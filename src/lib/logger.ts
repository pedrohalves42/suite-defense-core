/**
 * Structured logging utility for frontend applications
 * Logs to console in development and persists errors/warnings to backend in production
 * Enhanced with sanitization to prevent sensitive data leaks (INV-003)
 *
 * V-DIAG: Extended with correlation context (sessionId/tenantId/userId),
 * in-memory ring buffer, persistent storage of critical events, and
 * category-aware logging for the runtime diagnostics screen.
 */
import { sanitizeForLog, sanitizeError } from '@/lib/sanitize';

// Lazy-load supabase client to avoid crashing when env vars are missing
let _supabasePromise: Promise<typeof import('@/integrations/supabase/client')> | null = null;
function getSupabase() {
  if (!_supabasePromise) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return null;
    _supabasePromise = import('@/integrations/supabase/client');
  }
  return _supabasePromise;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogCategory = 'realtime' | 'tenant-sync' | 'auth' | 'query' | 'general';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LogContext = Record<string, any>;

export interface DiagEvent {
  ts: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  context: { sessionId?: string; tenantId?: string; userId?: string };
  data?: Record<string, unknown>;
}

// ───────── Correlation context ─────────
const correlation: { sessionId?: string; tenantId?: string; userId?: string } = {};
export function setLogCorrelation(ctx: Partial<typeof correlation>) {
  Object.assign(correlation, ctx);
}
export function getLogCorrelation() {
  return { ...correlation };
}

// ───────── Ring buffer for diagnostics screen ─────────
const RING_MAX = 500;
const RING: DiagEvent[] = [];
const PERSIST_KEY = 'cybershield:diag:events';
const PERSIST_MAX = 100;

const subscribers = new Set<(e: DiagEvent) => void>();
export function subscribeDiagEvents(cb: (e: DiagEvent) => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

function pushRing(evt: DiagEvent) {
  RING.push(evt);
  if (RING.length > RING_MAX) RING.shift();
  subscribers.forEach((cb) => {
    try { cb(evt); } catch { /* noop */ }
  });
  if (evt.level === 'error' || evt.level === 'warn') {
    persistEvent(evt);
  }
}

function persistEvent(evt: DiagEvent) {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(PERSIST_KEY);
    const arr: DiagEvent[] = raw ? JSON.parse(raw) : [];
    arr.push(evt);
    while (arr.length > PERSIST_MAX) arr.shift();
    window.localStorage.setItem(PERSIST_KEY, JSON.stringify(arr));
  } catch { /* quota or parse error: ignore */ }
}

export function getDiagBuffer(): DiagEvent[] {
  return [...RING];
}
export function getPersistedDiagEvents(): DiagEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PERSIST_KEY);
    return raw ? (JSON.parse(raw) as DiagEvent[]) : [];
  } catch { return []; }
}
export function clearDiagBuffer() {
  RING.length = 0;
  if (typeof window !== 'undefined') {
    try { window.localStorage.removeItem(PERSIST_KEY); } catch { /* noop */ }
  }
}

// ───────── Backend flush (unchanged behavior) ─────────
const LOG_BUFFER: Array<{ level: LogLevel; message: string; context?: LogContext; timestamp: string }> = [];
const RETRY_BUFFER: typeof LOG_BUFFER = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;
const FLUSH_INTERVAL_MS = 10000;
const MAX_BUFFER_SIZE = 20;
const MAX_RETRY_SIZE = 100;

async function flushLogs() {
  if (isFlushing || (LOG_BUFFER.length === 0 && RETRY_BUFFER.length === 0)) return;
  isFlushing = true;

  const sbPromise = getSupabase();
  if (!sbPromise) {
    LOG_BUFFER.length = 0;
    isFlushing = false;
    return;
  }

  const entries = [...RETRY_BUFFER.splice(0, MAX_BUFFER_SIZE), ...LOG_BUFFER.splice(0, MAX_BUFFER_SIZE)].slice(0, MAX_BUFFER_SIZE);

  try {
    const { supabase } = await sbPromise;
    const { error } = await supabase.functions.invoke('ops-gateway', {
      body: {
        action: 'sync:log-domain-event',
        payload: entries.map((entry) => ({
          aggregate_id: 'frontend',
          aggregate_type: 'frontend_log',
          event_type: `FrontendLog_${entry.level}`,
          payload: {
            message: entry.message,
            context: sanitizeForLog(entry.context) as Record<string, string | number | boolean | null> | undefined,
            url: typeof window !== 'undefined' ? window.location.href : undefined,
            user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
          },
          occurred_on: entry.timestamp,
        })),
      },
    });

    if (error) throw error;
  } catch {
    if (RETRY_BUFFER.length < MAX_RETRY_SIZE) {
      RETRY_BUFFER.push(...entries);
    }
  } finally {
    isFlushing = false;
    if (LOG_BUFFER.length > 0 || RETRY_BUFFER.length > 0) {
      scheduleFlush();
    }
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flushLogs();
  }, FLUSH_INTERVAL_MS);
}

// ───────── Category inference (best effort) ─────────
function inferCategory(message: string, context?: LogContext): LogCategory {
  const m = message.toLowerCase();
  if (m.includes('realtime') || m.includes('channel')) return 'realtime';
  if (m.includes('tenant') || m.includes('setactivetenant') || m.includes('useactivetenant')) return 'tenant-sync';
  if (m.includes('auth') || m.includes('session')) return 'auth';
  if (context && (context.queryKey || context.query)) return 'query';
  return 'general';
}

class Logger {
  private isDevelopment = import.meta.env.DEV;
  private appName = 'CyberShield';

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const sanitized = context ? sanitizeForLog(context) : undefined;
    const contextStr = sanitized ? ` ${JSON.stringify(sanitized)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${this.appName}] ${message}${contextStr}`;
  }

  private record(level: LogLevel, message: string, context?: LogContext, category?: LogCategory) {
    const sanitized = context ? (sanitizeForLog(context) as Record<string, unknown>) : undefined;
    const evt: DiagEvent = {
      ts: new Date().toISOString(),
      level,
      category: category ?? inferCategory(message, context),
      message,
      context: { ...correlation },
      data: sanitized,
    };
    pushRing(evt);
  }

  private sendToMonitoring(level: LogLevel, message: string, context?: LogContext) {
    if (this.isDevelopment) return;
    if (level !== 'warn' && level !== 'error') return;

    LOG_BUFFER.push({
      level,
      message,
      context: context ? (sanitizeForLog(context) as LogContext) : undefined,
      timestamp: new Date().toISOString(),
    });

    if (LOG_BUFFER.length >= MAX_BUFFER_SIZE) {
      flushLogs();
    } else {
      scheduleFlush();
    }
  }

  debug(message: string, context?: LogContext) {
    this.record('debug', message, context);
    if (this.isDevelopment) {
      // eslint-disable-next-line no-console
      console.log(this.formatMessage('debug', message, context));
    }
  }

  info(message: string, context?: LogContext) {
    this.record('info', message, context);
    if (this.isDevelopment) {
      // eslint-disable-next-line no-console
      console.log(this.formatMessage('info', message, context));
    }
    this.sendToMonitoring('info', message, context);
  }

  warn(message: string, context?: LogContext) {
    this.record('warn', message, context);
    if (this.isDevelopment) {
      console.warn(this.formatMessage('warn', message, context));
    }
    this.sendToMonitoring('warn', message, context);
  }

  error(message: string, error?: Error | unknown, context?: LogContext) {
    const errorContext = {
      ...context,
      error: sanitizeError(error),
    };
    this.record('error', message, errorContext);
    if (this.isDevelopment) {
      console.error(this.formatMessage('error', message, errorContext));
    }
    this.sendToMonitoring('error', message, errorContext);
  }

  /** Categorized log with explicit category (preferred for diagnostics). */
  log(level: LogLevel, category: LogCategory, message: string, context?: LogContext) {
    this.record(level, message, context, category);
    if (this.isDevelopment) {
      const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      fn(this.formatMessage(level, `[${category}] ${message}`, context));
    }
    this.sendToMonitoring(level, `[${category}] ${message}`, context);
  }
}

export const logger = new Logger();
