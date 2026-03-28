/**
 * Integration test helpers for Edge Functions.
 * Uses real HTTP calls against deployed functions.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";

export const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
export const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env");
}

/** Base URL for edge function invocations */
export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

interface FetchOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  agentToken?: string;
  jwt?: string;
}

/**
 * Call an edge function and return { response, body }.
 * Always consumes the response body (Deno requirement).
 */
export async function callFunction(
  functionName: string,
  options: FetchOptions = {},
): Promise<{ response: Response; body: unknown; text: string }> {
  const { method = "POST", body, headers = {}, agentToken, jwt } = options;

  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "apikey": SUPABASE_ANON_KEY,
    ...headers,
  };

  if (agentToken) {
    requestHeaders["X-Agent-Token"] = agentToken;
  }
  if (jwt) {
    requestHeaders["Authorization"] = `Bearer ${jwt}`;
  }

  const response = await fetch(`${FUNCTIONS_URL}/${functionName}`, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  return { response, body: parsed, text };
}

/**
 * Assert that a response has a specific status code.
 */
export function assertStatus(
  response: Response,
  expectedStatus: number,
  context?: string,
): void {
  const { assertEquals } = await_assert();
  assertEquals(
    response.status,
    expectedStatus,
    `${context || "Request"} expected status ${expectedStatus}, got ${response.status}`,
  );
}

/**
 * Assert that a response has status >= 400 (any error).
 */
export function assertError(response: Response, context?: string): void {
  if (response.status < 400) {
    throw new Error(
      `${context || "Request"} expected error (4xx/5xx), got ${response.status}`,
    );
  }
}

/**
 * Assert that a response is a 401 Unauthorized.
 */
export function assertUnauthorized(response: Response, context?: string): void {
  assertStatus(response, 401, context || "Auth check");
}

// Lazy import to avoid top-level issues
function await_assert() {
  // deno-lint-ignore no-explicit-any
  return { assertEquals: (a: any, b: any, msg?: string) => {
    if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`);
  }};
}
