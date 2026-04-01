import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DomainEvent } from '@/domain/shared/DomainEvent';
import type { DomainEventDispatcher } from '@/application/ports/output/DomainEventDispatcher';
import { CompositeDomainEventDispatcher } from '../events/CompositeDomainEventDispatcher';
import { LoggingEventDispatcher } from '../events/LoggingEventDispatcher';

const makeEvent = (type = 'test.event'): DomainEvent => ({
  eventType: type,
  aggregateId: crypto.randomUUID(),
  occurredOn: new Date(),
});

// ── CompositeDomainEventDispatcher ───────────────────────────────
describe('CompositeDomainEventDispatcher', () => {
  it('dispatches to all inner dispatchers', async () => {
    const d1: DomainEventDispatcher = { dispatch: vi.fn(), dispatchAll: vi.fn() };
    const d2: DomainEventDispatcher = { dispatch: vi.fn(), dispatchAll: vi.fn() };
    const composite = new CompositeDomainEventDispatcher([d1, d2]);

    const event = makeEvent();
    await composite.dispatch(event);

    expect(d1.dispatch).toHaveBeenCalledWith(event);
    expect(d2.dispatch).toHaveBeenCalledWith(event);
  });

  it('dispatchAll delegates to all', async () => {
    const d1: DomainEventDispatcher = { dispatch: vi.fn(), dispatchAll: vi.fn() };
    const d2: DomainEventDispatcher = { dispatch: vi.fn(), dispatchAll: vi.fn() };
    const composite = new CompositeDomainEventDispatcher([d1, d2]);

    const events = [makeEvent(), makeEvent()];
    await composite.dispatchAll(events);

    expect(d1.dispatchAll).toHaveBeenCalledWith(events);
    expect(d2.dispatchAll).toHaveBeenCalledWith(events);
  });

  it('does not throw if one dispatcher fails', async () => {
    const failing: DomainEventDispatcher = {
      dispatch: vi.fn().mockRejectedValue(new Error('fail')),
      dispatchAll: vi.fn(),
    };
    const ok: DomainEventDispatcher = { dispatch: vi.fn(), dispatchAll: vi.fn() };
    const composite = new CompositeDomainEventDispatcher([failing, ok]);

    await expect(composite.dispatch(makeEvent())).resolves.toBeUndefined();
    expect(ok.dispatch).toHaveBeenCalled();
  });

  it('handles empty dispatchers list', async () => {
    const composite = new CompositeDomainEventDispatcher([]);
    await expect(composite.dispatch(makeEvent())).resolves.toBeUndefined();
  });
});

// ── LoggingEventDispatcher ───────────────────────────────────────
describe('LoggingEventDispatcher', () => {
  it('dispatch does not throw', async () => {
    const dispatcher = new LoggingEventDispatcher();
    await expect(dispatcher.dispatch(makeEvent())).resolves.toBeUndefined();
  });

  it('dispatchAll processes all events', async () => {
    const dispatcher = new LoggingEventDispatcher();
    const events = [makeEvent('a'), makeEvent('b'), makeEvent('c')];
    await expect(dispatcher.dispatchAll(events)).resolves.toBeUndefined();
  });

  it('dispatchAll handles empty array', async () => {
    const dispatcher = new LoggingEventDispatcher();
    await expect(dispatcher.dispatchAll([])).resolves.toBeUndefined();
  });
});
