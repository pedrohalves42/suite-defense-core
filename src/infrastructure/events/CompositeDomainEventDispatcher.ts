import type { DomainEventDispatcher } from '@/application/ports/output/DomainEventDispatcher';
import type { DomainEvent } from '@/domain/shared/DomainEvent';

/**
 * Composite adapter: delegates to multiple dispatchers (e.g., logging + persistence).
 * Follows the Decorator pattern — all dispatchers run in parallel, best-effort.
 */
export class CompositeDomainEventDispatcher implements DomainEventDispatcher {
  constructor(private readonly dispatchers: DomainEventDispatcher[]) {}

  async dispatch(event: DomainEvent): Promise<void> {
    await Promise.allSettled(
      this.dispatchers.map(d => d.dispatch(event))
    );
  }

  async dispatchAll(events: DomainEvent[]): Promise<void> {
    await Promise.allSettled(
      this.dispatchers.map(d => d.dispatchAll(events))
    );
  }
}
