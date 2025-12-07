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
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      getUser: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(),
          limit: vi.fn(() => ({
            maybeSingle: vi.fn(),
          })),
        })),
      })),
    })),
    functions: {
      invoke: vi.fn(),
    },
  },
}))
