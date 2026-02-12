/**
 * Base interface for domain events.
 * Events represent something that happened in the domain.
 */
export interface DomainEvent {
  readonly eventType: string;
  readonly occurredOn: Date;
  readonly aggregateId: string;
}

/**
 * Simple in-memory event publisher for domain events.
 */
export class DomainEventPublisher {
  private static handlers: Map<string, Array<(event: DomainEvent) => void>> = new Map();

  static subscribe(eventType: string, handler: (event: DomainEvent) => void): void {
    const existing = this.handlers.get(eventType) || [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }

  static publish(event: DomainEvent): void {
    const handlers = this.handlers.get(event.eventType) || [];
    handlers.forEach(handler => handler(event));
  }

  static clear(): void {
    this.handlers.clear();
  }
}
