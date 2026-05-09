/**
 * Secure logging utility for Edge Functions
 * P3 Enhancement: Structured logging with levels, metrics, and correlation
 * Only logs sensitive details in development, generic messages in production
 * Supports X-Request-ID correlation
 * 
 * PHASE-1: Added tenantId / agentId to LogEntry for indexable observability.
 */

declare const Deno: {
  env: { get(key: string): string | undefined };
  stdout?: { sync?: () => void };
  stderr?: { sync?: () => void };
} | undefined;

const isDev = typeof Deno !== 'undefined' ? Deno.env.get('ENVIRONMENT') === 'development' : false;
const forceLogging = typeof Deno !== 'undefined' ? Deno.env.get('FORCE_LOGGING') === 'true' : false;

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: unknown;
  requestId?: string;
  traceId?: string;
  tenantId?: string;
  agentId?: string;
  duration_ms?: number;
}

/** Optional context bag passed to loggerWithContext */
export interface LogContext {
  requestId: string;
  /** End-to-end trace ID propagated from agent. Falls back to requestId if not provided. */
  traceId?: string;
  tenantId?: string;
  agentId?: string;
  /** Internal error stack for debugging, will be sanitized/omitted in certain levels if needed */
  stack?: string;
}

/**
 * Sanitize sensitive data for production logging
 */
function sanitize(data: unknown, seen = new WeakSet()): unknown {
  if (data === null || typeof data !== 'object') {
    if (typeof data === 'string') {
      if (data.includes('@') && data.includes('.')) {
        const [local, domain] = data.split('@');
        return `${local.slice(0, 2)}***@${domain}`;
      }
      if (data.length > 40) {
        return `${data.slice(0, 8)}***`;
      }
    }
    return data;
  }

  // Handle circular references
  if (seen.has(data as object)) return '[Circular]';
  seen.add(data as object);

  if (Array.isArray(data)) {
    return data.map(item => sanitize(item, seen));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lowKey = key.toLowerCase();
    if (['password', 'token', 'secret', 'key', 'hmac', 'auth', 'credential', 'private'].some(s => lowKey.includes(s))) {
      sanitized[key] = '***REDACTED***';
    } else {
      sanitized[key] = sanitize(value, seen);
    }
  }
  return sanitized;
}

/**
 * Format log entry as structured JSON for production
 */
function formatLogEntry(entry: LogEntry): string {
  if (isDev || forceLogging) {
    return JSON.stringify(entry, null, 2);
  }
  return JSON.stringify(entry);
}

/**
 * Enrich a LogEntry with optional context fields
 */
function enrichEntry(entry: LogEntry, ctx?: Partial<LogContext>): LogEntry {
  if (!ctx) return entry;
  if (ctx.requestId) entry.requestId = ctx.requestId;
  if (ctx.traceId) entry.traceId = ctx.traceId;
  else if (ctx.requestId) entry.traceId = ctx.requestId;
  if (ctx.tenantId) entry.tenantId = ctx.tenantId;
  if (ctx.agentId) entry.agentId = ctx.agentId;
  
  // If stack is provided, we can either add it to data or entry (if we want it first-class)
  if (ctx.stack) {
    if (!entry.data) entry.data = {};
    if (typeof entry.data === 'object' && entry.data !== null) {
      (entry.data as Record<string, any>).stack = ctx.stack;
    }
  }
  
  return entry;
}

/**
 * P3+PHASE-1: Creates a logger instance with context fields (requestId, tenantId, agentId) and timing.
 */
export const loggerWithContext = (ctxOrRequestId: LogContext | string) => {
  const ctx: LogContext = typeof ctxOrRequestId === 'string'
    ? { requestId: ctxOrRequestId }
    : ctxOrRequestId;
  const startTime = Date.now();

  return {
    debug: (message: string, data?: unknown) => logger.debug(`[${ctx.requestId}] ${message}`, data, ctx),
    info: (message: string, data?: unknown) => logger.info(`[${ctx.requestId}] ${message}`, data, ctx),
    warn: (message: string, data?: unknown) => logger.warn(`[${ctx.requestId}] ${message}`, data, ctx),
    error: (message: string, error?: unknown) => logger.error(`[${ctx.requestId}] ${message}`, error, ctx),
    success: (message: string, data?: unknown) => logger.success(`[${ctx.requestId}] ${message}`, data, ctx),

    timed: (message: string, data?: unknown) => {
      const duration = Date.now() - startTime;
      logger.info(`[${ctx.requestId}] ${message}`, { ...((data as Record<string, unknown>) ?? {}), duration_ms: duration }, ctx);
    },

    elapsed: () => Date.now() - startTime,
  };
};


export async function flushLogSinks(): Promise<void> {
  const maybeDeno = typeof Deno !== 'undefined' ? Deno : undefined;

  try {
    const stdout = maybeDeno?.stdout as { sync?: () => void } | undefined;
    stdout?.sync?.();
  } catch { /* stdout sync is best-effort */ }

  try {
    const stderr = maybeDeno?.stderr as { sync?: () => void } | undefined;
    stderr?.sync?.();
  } catch { /* stderr sync is best-effort */ }

}

export function scheduleLogFlush(): void {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  const flushPromise = flushLogSinks();
  if (runtime?.waitUntil) {
    runtime.waitUntil(flushPromise);
  } else {
    flushPromise.catch(() => undefined);
  }
}

export const logger = {
  debug: (message: string, data?: unknown, ctx?: Partial<LogContext>) => {
    if (isDev || forceLogging) {
      const entry = enrichEntry({
        timestamp: new Date().toISOString(),
        level: 'debug',
        message,
        data,
      }, ctx);
      console.log(formatLogEntry(entry));
    }
  },

  info: (message: string, data?: unknown, ctx?: Partial<LogContext>) => {
    const entry = enrichEntry({
      timestamp: new Date().toISOString(),
      level: 'info',
      message,
      data: (isDev || forceLogging) ? data : sanitize(data),
    }, ctx);
    console.log(formatLogEntry(entry));
  },

  warn: (message: string, data?: unknown, ctx?: Partial<LogContext>) => {
    const entry = enrichEntry({
      timestamp: new Date().toISOString(),
      level: 'warn',
      message,
      data: isDev ? data : sanitize(data),
    }, ctx);
    console.warn(formatLogEntry(entry));
  },

  error: (message: string, error?: unknown, ctx?: Partial<LogContext>) => {
    const entry = enrichEntry({
      timestamp: new Date().toISOString(),
      level: 'error',
      message,
      data: isDev
        ? error
        : error instanceof Error
          ? { message: error.message, name: error.name }
          : sanitize(error),
    }, ctx);
    console.error(formatLogEntry(entry));
  },

  success: (message: string, data?: unknown, ctx?: Partial<LogContext>) => {
    const entry = enrichEntry({
      timestamp: new Date().toISOString(),
      level: 'success',
      message,
      data: (isDev || forceLogging) ? data : sanitize(data),
    }, ctx);
    console.log(formatLogEntry(entry));
  },

  metric: (name: string, value: number, tags?: Record<string, string>) => {
    const entry = {
      timestamp: new Date().toISOString(),
      type: 'metric',
      name,
      value,
      tags,
    };
    console.log(JSON.stringify(entry));
  },

  span: (name: string, startTime: number, data?: Record<string, unknown>) => {
    const duration = Date.now() - startTime;
    const entry = {
      timestamp: new Date().toISOString(),
      type: 'span',
      name,
      duration_ms: duration,
      data,
    };
    console.log(JSON.stringify(entry));
  },
};
