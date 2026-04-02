import { expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'

// Silence React act() warnings that are noise during async hook tests
// Filter both console.warn AND console.error as React may use either
const originalWarn = console.warn;
const originalError = console.error;

const isActWarning = (message: unknown): boolean => {
  return typeof message === 'string' && message.includes('not wrapped in act');
};

console.warn = (...args: unknown[]) => {
  if (isActWarning(args[0])) return;
  originalWarn.apply(console, args);
};

console.error = (...args: unknown[]) => {
  if (isActWarning(args[0])) return;
  originalError.apply(console, args);
};

expect.extend(matchers)

afterEach(() => {
  cleanup()
})

// Mock Supabase client
const chainable = (): any => new Proxy({}, { get: () => vi.fn().mockReturnValue(chainable()) });

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: {}, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      exchangeCodeForSession: vi.fn().mockResolvedValue({ data: {}, error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
      mfa: {
        listFactors: vi.fn().mockResolvedValue({ data: { totp: [], phone: [] }, error: null }),
        enroll: vi.fn().mockResolvedValue({ data: {}, error: null }),
        challenge: vi.fn().mockResolvedValue({ data: {}, error: null }),
        verify: vi.fn().mockResolvedValue({ data: {}, error: null }),
        getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({ data: { currentLevel: 'aal1' }, error: null }),
      },
    },
    from: vi.fn(() => chainable()),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    }),
    removeChannel: vi.fn(),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}))
