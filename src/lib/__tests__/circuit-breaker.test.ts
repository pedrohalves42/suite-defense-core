import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger before importing
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { CircuitBreaker, CircuitState } from '../circuit-breaker';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker({ name: 'test', failureThreshold: 3, successThreshold: 2, timeout: 100 });
  });

  it('starts in CLOSED state', () => {
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  it('executes successfully in CLOSED state', async () => {
    const result = await cb.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  it('opens after reaching failure threshold', async () => {
    const fail = () => Promise.reject(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await cb.execute(fail).catch(() => {});
    }
    expect(cb.getState()).toBe(CircuitState.OPEN);
  });

  it('rejects immediately when OPEN', async () => {
    // Force open
    const fail = () => Promise.reject(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await cb.execute(fail).catch(() => {});
    }

    await expect(cb.execute(() => Promise.resolve('ok'))).rejects.toThrow('OPEN');
  });

  it('transitions to HALF_OPEN after timeout', async () => {
    const fail = () => Promise.reject(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await cb.execute(fail).catch(() => {});
    }

    // Wait for timeout
    await new Promise(r => setTimeout(r, 150));

    // Next call should transition to HALF_OPEN and succeed
    const result = await cb.execute(() => Promise.resolve('recovered'));
    expect(result).toBe('recovered');
  });

  it('closes after enough successes in HALF_OPEN', async () => {
    const fail = () => Promise.reject(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await cb.execute(fail).catch(() => {});
    }

    await new Promise(r => setTimeout(r, 150));

    // Need 2 successes (successThreshold) to close
    await cb.execute(() => Promise.resolve('ok'));
    await cb.execute(() => Promise.resolve('ok'));
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  it('reopens on failure in HALF_OPEN', async () => {
    const fail = () => Promise.reject(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await cb.execute(fail).catch(() => {});
    }

    await new Promise(r => setTimeout(r, 150));

    // Fail in HALF_OPEN
    await cb.execute(fail).catch(() => {});
    expect(cb.getState()).toBe(CircuitState.OPEN);
  });

  it('resets manually', async () => {
    const fail = () => Promise.reject(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await cb.execute(fail).catch(() => {});
    }
    expect(cb.getState()).toBe(CircuitState.OPEN);

    cb.reset();
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  it('uses default options', () => {
    const defaultCb = new CircuitBreaker();
    expect(defaultCb.getState()).toBe(CircuitState.CLOSED);
  });
});
