/**
 * Secure logging utility for Edge Functions
 * P3 Enhancement: Structured logging with levels, metrics, and correlation
 * Only logs sensitive details in development, generic messages in production
 * Supports X-Request-ID correlation
 */

declare const Deno: { env: { get(key: string): string | undefined } } | undefined;

const isDev = typeof Deno !== 'undefined' ? Deno.env.get('ENVIRONMENT') === 'development' : false;
const forceLogging = typeof Deno !== 'undefined' ? Deno.env.get('FORCE_LOGGING') === 'true' : false;

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: unknown;
  requestId?: string;
  duration_ms?: number;
}

/**
 * Sanitize sensitive data for production logging
 */
function sanitize(data: unknown): unknown {
  if (typeof data === 'string') {
    if (data.includes('@')) {
      const [local, domain] = data.split('@');
      return `${local.slice(0, 2)}***@${domain}`;
    }
    if (data.length > 20) {
      return `${data.slice(0, 8)}***`;
    }
  }
  if (typeof data === 'object' && data !== null) {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      // Redact sensitive fields
      if (['password', 'token', 'secret', 'key', 'hmac'].some(s => key.toLowerCase().includes(s))) {
        sanitized[key] = '***REDACTED***';
      } else {
        sanitized[key] = sanitize(value);
      }
    }
    return sanitized;
  }
  return data;
}

/**
 * Format log entry as structured JSON for production
 */
function formatLogEntry(entry: LogEntry): string {
  if (isDev || forceLogging) {
    return JSON.stringify(entry, null, 2);
  }
  // Compact format for production
  return JSON.stringify(entry);
}

/**
 * P3: Creates a logger instance with X-Request-ID prefix and timing
 */
export const loggerWithContext = (requestId: string) => {
  const startTime = Date.now();
  
  return {
    debug: (message: string, data?: unknown) => logger.debug(`[${requestId}] ${message}`, data),
    info: (message: string, data?: unknown) => logger.info(`[${requestId}] ${message}`, data),
    warn: (message: string, data?: unknown) => logger.warn(`[${requestId}] ${message}`, data),
    error: (message: string, error?: unknown) => logger.error(`[${requestId}] ${message}`, error),
    success: (message: string, data?: unknown) => logger.success(`[${requestId}] ${message}`, data),
    
    // P3: New method for timed operations
    timed: (message: string, data?: unknown) => {
      const duration = Date.now() - startTime;
      logger.info(`[${requestId}] ${message}`, { ...((data as Record<string, unknown>) ?? {}), duration_ms: duration });
    },
    
    // P3: Get elapsed time
    elapsed: () => Date.now() - startTime,
  };
};

export const logger = {
  /**
   * Debug level - only logs in development or when forced
   */
  debug: (message: string, data?: unknown) => {
    if (isDev || forceLogging) {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'debug',
        message,
        data,
      };
      console.log(formatLogEntry(entry));
    }
  },

  /**
   * Info level - logs generic message in production, detailed in dev or forced
   */
  info: (message: string, data?: unknown) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      message,
      data: (isDev || forceLogging) ? data : sanitize(data),
    };
    console.log(formatLogEntry(entry));
  },

  /**
   * Warning level - always logs but sanitizes in production
   */
  warn: (message: string, data?: unknown) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'warn',
      message,
      data: isDev ? data : sanitize(data),
    };
    console.warn(formatLogEntry(entry));
  },

  /**
   * Error level - always logs but sanitizes sensitive details
   */
  error: (message: string, error?: unknown) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message,
      data: isDev 
        ? error 
        : error instanceof Error 
          ? { message: error.message, name: error.name }
          : sanitize(error),
    };
    console.error(formatLogEntry(entry));
  },

  /**
   * Success level - logs operation completion
   */
  success: (message: string, data?: unknown) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'success',
      message,
      data: (isDev || forceLogging) ? data : sanitize(data),
    };
    console.log(formatLogEntry(entry));
  },

  /**
   * P3: Metric logging for observability
   */
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

  /**
   * P3: Span logging for distributed tracing
   */
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
