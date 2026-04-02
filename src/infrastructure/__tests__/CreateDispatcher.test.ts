import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDomainEventDispatcher } from '@/infrastructure/events/createDomainEventDispatcher';

// Reset singleton between tests
vi.mock('@/infrastructure/events/createDomainEventDispatcher', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/infrastructure/events/createDomainEventDispatcher')>();
  // Re-export but we'll test the actual function behavior
  return mod;
});

describe('createDomainEventDispatcher', () => {
  it('returns a DomainEventDispatcher', () => {
    const dispatcher = createDomainEventDispatcher();
    expect(dispatcher).toBeDefined();
    expect(typeof dispatcher.dispatch).toBe('function');
    expect(typeof dispatcher.dispatchAll).toBe('function');
  });

  it('returns singleton (same instance)', () => {
    const d1 = createDomainEventDispatcher();
    const d2 = createDomainEventDispatcher();
    expect(d1).toBe(d2);
  });
});
