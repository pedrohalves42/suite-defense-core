import type { DomainEvent } from './DomainEvent';
import type { ValueObject } from './ValueObject';

/**
 * Base class for Domain Entities.
 * Entities are compared by identity (ID), not by value.
 * Aggregate roots collect domain events for later dispatch.
 */
export abstract class Entity<T extends ValueObject<string>> {
  private _domainEvents: DomainEvent[] = [];

  protected constructor(private readonly _id: T) {}

  get id(): T {
    return this._id;
  }

  get domainEvents(): DomainEvent[] {
    return [...this._domainEvents];
  }

  protected addDomainEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  clearDomainEvents(): void {
    this._domainEvents = [];
  }

  equals(other: Entity<T>): boolean {
    if (other === null || other === undefined) return false;
    if (!(other instanceof Entity)) return false;
    return this._id.equals(other._id);
  }
}
