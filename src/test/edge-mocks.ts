/**
 * Deno API mocks for testing Edge Function shared utilities in Vitest/Node.
 *
 * Usage: import this file at the top of your test before importing the module under test.
 *   import { setEnv, clearEnv } from './edge-mocks';
 */

const envStore = new Map<string, string>();

// Install a minimal Deno.env mock on globalThis
(globalThis as Record<string, unknown>).Deno = {
  env: {
    get: (key: string) => envStore.get(key),
    set: (key: string, value: string) => envStore.set(key, value),
    delete: (key: string) => envStore.delete(key),
    toObject: () => Object.fromEntries(envStore),
  },
};

/** Set an env var in the mock store. */
export function setEnv(key: string, value: string): void {
  envStore.set(key, value);
}

/** Delete an env var from the mock store. */
export function clearEnv(key: string): void {
  envStore.delete(key);
}

/** Reset all env vars. */
export function resetEnv(): void {
  envStore.clear();
}
