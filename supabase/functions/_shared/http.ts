import { logger } from './logger.ts';
import { TIMEOUT_TIERS, fetchWithTimeout } from './fetch-with-timeout.ts';

/**
 * Standard HTTP error with status and body
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: any
  ) {
    super(`HTTP ${status}: ${statusText}`);
    this.name = 'HttpError';
  }
}

export interface HttpRequestOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
  maxBackoffMs?: number;
}

/**
 * Robust JSON fetch wrapper with timeout, jittered retries, and error handling.
 * ADR-045: Prohibits raw fetch() usage in business logic.
 */
export async function httpJson<T = any>(
  url: string | URL,
  options: HttpRequestOptions = {}
): Promise<T> {
  const {
    timeoutMs = TIMEOUT_TIERS.DEFAULT,
    retries = 3,
    backoffMs = 500,
    maxBackoffMs = 5000,
    ...fetchOptions
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      if (attempt > 0) {
        // Jittered exponential backoff
        const delay = Math.min(
          maxBackoffMs,
          backoffMs * Math.pow(2, attempt - 1) * (0.8 + Math.random() * 0.4)
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        logger.debug(`[httpJson] Retry attempt ${attempt} for ${url}`);
      }

      const response = await fetchWithTimeout(url, {
        ...fetchOptions,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...fetchOptions.headers,
        },
        timeoutMs,
        signal: fetchOptions.signal || controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorBody;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = await response.text();
        }
        
        const error = new HttpError(response.status, response.statusText, errorBody);
        
        // Only retry on 5xx or specific network errors
        if (response.status >= 500 && attempt < retries) {
          lastError = error;
          continue;
        }
        throw error;
      }

      // Check for empty body (204 No Content)
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        return (null as unknown) as T;
      }

      return await response.json() as T;

    } catch (error) {
      clearTimeout(timeoutId);
      
      const isTimeout = error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError');
      const isNetworkError = error instanceof TypeError && error.message.includes('fetch');
      
      if ((isTimeout || isNetworkError) && attempt < retries) {
        lastError = error instanceof Error ? error : new Error(String(error));
        continue;
      }
      
      throw error;
    }
  }

  throw lastError || new Error('HTTP request failed after maximum retries');
}
