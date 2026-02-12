import type { DomainEvent } from '@/domain/shared/DomainEvent';

/**
 * Output port: Dispatches domain events to external consumers
 * (logging, notifications, analytics, etc).
 */
export interface DomainEventDispatcher {
  dispatch(event: DomainEvent): Promise<void>;
  dispatchAll(events: DomainEvent[]): Promise<void>;
}
