/**
 * fetch-with-timeout.ts
 * 
 * Drop-in replacement for fetch() with mandatory timeout.
 * Prevents worker hangs from slow/unresponsive external services.
 * Default timeout: 15 seconds (per backend-request-timeout-policy).
 */

export async function fetchWithTimeout(
  url: string | URL,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 15_000, ...fetchOptions } = options;

  return fetch(url, {
    ...fetchOptions,
    signal: fetchOptions.signal ?? AbortSignal.timeout(timeoutMs),
  });
}
