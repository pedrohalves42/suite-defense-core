/**
 * Secure logging utility for Edge Functions
 * Only logs sensitive details in development, generic messages in production
 */

const isDev = Deno.env.get('ENVIRONMENT') === 'development';

/**
 * Sanitize sensitive data for production logging
 */
function sanitize(data: any): any {
  if (typeof data === 'string') {
    // Mask emails
    if (data.includes('@')) {
      const [local, domain] = data.split('@');
      return `${local.slice(0, 2)}***@${domain}`;
    }
    // Mask long strings (potential tokens/keys)
    if (data.length > 20) {
      return `${data.slice(0, 8)}***`;
    }
  }
  return data;
}

export const logger = {
  /**
   * Debug level - only logs in development
   */
  debug: (message: string, data?: any) => {
    if (isDev) {
      console.log(`[DEBUG] ${message}`, data);
    }
  },

  /**
   * Info level - logs generic message in production, detailed in dev
   */
  info: (message: string, data?: any) => {
    if (isDev) {
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
  success: (message: string) => {
    console.log(`[SUCCESS] ${message}`);
  }
};
