import type { DomainEventDispatcher } from '@/application/ports/output/DomainEventDispatcher';
import { LoggingEventDispatcher } from './LoggingEventDispatcher';
import { PersistentDomainEventPublisher } from './PersistentDomainEventPublisher';
import { CompositeDomainEventDispatcher } from './CompositeDomainEventDispatcher';

/**
 * Factory: Creates the default DomainEventDispatcher for the CyberShield application.
 * Wires both logging (observability) and persistence (audit trail) adapters.
 * 
 * Usage in composition root / hooks:
 *   const eventDispatcher = createDomainEventDispatcher();
 *   const useCase = new EnrollAgent(agentRepo, cryptoService, eventDispatcher);
 */
export function createDomainEventDispatcher(): DomainEventDispatcher {
  return new CompositeDomainEventDispatcher([
    new LoggingEventDispatcher(),
    new PersistentDomainEventPublisher(),
  ]);
}
