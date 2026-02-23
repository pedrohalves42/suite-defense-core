import type { DomainEventDispatcher } from '@/application/ports/output/DomainEventDispatcher';
import { LoggingEventDispatcher } from './LoggingEventDispatcher';
import { PersistentDomainEventPublisher } from './PersistentDomainEventPublisher';
import { CompositeDomainEventDispatcher } from './CompositeDomainEventDispatcher';

/**
 * Factory (Singleton): Creates the default DomainEventDispatcher.
 * Reuses the same instance to reduce memory allocations and GC pressure.
 */
let instance: DomainEventDispatcher | null = null;

export function createDomainEventDispatcher(): DomainEventDispatcher {
  if (!instance) {
    instance = new CompositeDomainEventDispatcher([
      new LoggingEventDispatcher(),
      new PersistentDomainEventPublisher(),
    ]);
  }
  return instance;
}
