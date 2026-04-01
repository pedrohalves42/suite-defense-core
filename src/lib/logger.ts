/**
 * Structured logging utility for frontend applications
 * Logs to console in development and persists errors/warnings to backend in production
 * Enhanced with sanitization to prevent sensitive data leaks (INV-003)
 */
import { supabase } from '@/integrations/supabase/client';
import { sanitizeForLog, sanitizeError } from '@/lib/sanitize';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LogContext = Record<string, any>;

// Buffer to batch log entries and avoid excessive network calls
const LOG_BUFFER: Array<{ level: LogLevel; message: string; context?: LogContext; timestamp: string }> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL_MS = 10000; // Flush every 10 seconds
const MAX_BUFFER_SIZE = 20;

async function flushLogs() {
  if (LOG_BUFFER.length === 0) return;

  const entries = LOG_BUFFER.splice(0, MAX_BUFFER_SIZE);

  try {
    await supabase.functions.invoke('ops-gateway', {
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
  } catch {
    // Best-effort — don't crash the app if logging fails
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushLogs();
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
