/**
 * Secure logging utility for Edge Functions
 * Only logs sensitive details in development, generic messages in production
 * Supports X-Request-ID correlation
 */

const isDev = Deno.env.get('ENVIRONMENT') === 'development';
const forceLogging = Deno.env.get('FORCE_LOGGING') === 'true';

/**
 * Sanitize sensitive data for production logging
 */
function sanitize(data: any): any {
  if (typeof data === 'string') {
    if (data.includes('@')) {
      const [local, domain] = data.split('@');
      return `${local.slice(0, 2)}***@${domain}`;
    }
    if (data.length > 20) {
      return `${data.slice(0, 8)}***`;
    }
  }
  return data;
}

/**
 * Creates a logger instance with X-Request-ID prefix
 */
export const loggerWithContext = (requestId: string) => ({
  debug: (message: string, data?: any) => logger.debug(`[${requestId}] ${message}`, data),
  info: (message: string, data?: any) => logger.info(`[${requestId}] ${message}`, data),
  warn: (message: string, data?: any) => logger.warn(`[${requestId}] ${message}`, data),
  error: (message: string, error?: any) => logger.error(`[${requestId}] ${message}`, error),
  success: (message: string, data?: any) => logger.success(`[${requestId}] ${message}`, data),
});

export const logger = {
  /**
   * Debug level - only logs in development or when forced
   */
  debug: (message: string, data?: any) => {
    if (isDev || forceLogging) {
      console.log(`[DEBUG] ${message}`, data);
    }
  },

  /**
   * Info level - logs generic message in production, detailed in dev or forced
   */
  info: (message: string, data?: any) => {
    if (isDev || forceLogging) {
      console.log(`[INFO] ${message}`, data);
    } else {
      console.log(`[INFO] ${message}`);
    }
  },

  /**
   * Warning level - always logs but sanitizes in production
   */
  warn: (message: string, data?: any) => {
    if (isDev) {
      console.warn(`[WARN] ${message}`, data);
    } else {
      console.warn(`[WARN] ${message}`, data ? sanitize(data) : undefined);
    }
  },

  /**
   * Error level - always logs but sanitizes sensitive details
   */
  error: (message: string, error?: any) => {
    if (isDev) {
      console.error(`[ERROR] ${message}`, error);
    } else {
      // Only log error message, not full stack trace in production
      const errorMsg = error instanceof Error ? error.message : 'See server logs';
      console.error(`[ERROR] ${message}:`, errorMsg);
    }
  },

  /**
   * Success level - logs operation completion
   */
  success: (message: string, data?: any) => {
    if (isDev || forceLogging) {
      console.log(`[SUCCESS] ${message}`, data);
    } else {
      console.log(`[SUCCESS] ${message}`);
    }
  }
};
