import type { DomainEventDispatcher } from '@/application/ports/output/DomainEventDispatcher';
import type { DomainEvent } from '@/domain/shared/DomainEvent';
import { logger } from '@/lib/logger';

/**
 * Logs domain events to console. In production, this could be replaced
 * with a Supabase-backed event store, webhook dispatcher, or message queue.
 */
export class LoggingEventDispatcher implements DomainEventDispatcher {
  async dispatch(event: DomainEvent): Promise<void> {
    logger.debug(`[DomainEvent] ${event.eventType}`, {
      aggregateId: event.aggregateId,
      occurredOn: event.occurredOn.toISOString(),
    });
  }

  async dispatchAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.dispatch(event);
    }
  }
}
