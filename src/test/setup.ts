import { expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'

// Silence React act() warnings that are noise during async hook tests
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const message = args[0];
  if (typeof message === 'string' && message.includes('not wrapped in act')) {
    return;
  }
  originalWarn.apply(console, args);
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
