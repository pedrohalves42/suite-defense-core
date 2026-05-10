/**
 * Structured logging utility for frontend applications
 * Logs to console in development and persists errors/warnings to backend in production
 * Enhanced with sanitization to prevent sensitive data leaks (INV-003)
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

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LogContext = Record<string, any>;

// Buffer to batch log entries and avoid excessive network calls
const LOG_BUFFER: Array<{ level: LogLevel; message: string; context?: LogContext; timestamp: string }> = [];
const RETRY_BUFFER: typeof LOG_BUFFER = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;
const FLUSH_INTERVAL_MS = 10000; // Flush every 10 seconds
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

  // Combine fresh logs and retries
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
  } catch (err) {
    // ADR-032: Keep logs in retry buffer if network or function fails
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

class Logger {
  private isDevelopment = import.meta.env.DEV;
  private appName = 'CyberShield';

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const sanitized = context ? sanitizeForLog(context) : undefined;
    const contextStr = sanitized ? ` ${JSON.stringify(sanitized)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${this.appName}] ${message}${contextStr}`;
  }

  private sendToMonitoring(level: LogLevel, message: string, context?: LogContext) {
    if (this.isDevelopment) return;

    // Only persist warn and error in production to control costs
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
    if (this.isDevelopment) {
      // eslint-disable-next-line no-console
      console.log(this.formatMessage('debug', message, context));
    }
  }

  info(message: string, context?: LogContext) {
    if (this.isDevelopment) {
      // eslint-disable-next-line no-console
      console.log(this.formatMessage('info', message, context));
    }
    this.sendToMonitoring('info', message, context);
  }

  warn(message: string, context?: LogContext) {
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

    if (this.isDevelopment) {
      console.error(this.formatMessage('error', message, errorContext));
    }
    this.sendToMonitoring('error', message, errorContext);
  }
}

export const logger = new Logger();
