/**
 * Timeout wrapper for Edge Functions
 * Prevents hanging requests by enforcing a maximum execution time
 */

export interface TimeoutOptions {
  timeoutMs?: number;
  timeoutMessage?: string;
}

/**
 * Wraps an async function with a timeout
 * @param fn The async function to wrap
 * @param options Timeout configuration
 * @returns A promise that resolves with the function result or rejects on timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  options: TimeoutOptions = {}
): Promise<T> {
  const { timeoutMs = 25000, timeoutMessage = 'Request timeout' } = options;

  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(timeoutMessage)),
        timeoutMs
      )
    ),
  ]);
}

/**
 * Creates a timeout response for Edge Functions
 */
export function createTimeoutResponse(corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({
      error: 'Gateway Timeout',
      message: 'The request took too long to process',
      code: 'TIMEOUT',
    }),
    {
      status: 504,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}
