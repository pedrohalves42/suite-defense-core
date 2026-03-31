import type { DomainEvent } from '@/domain/shared/DomainEvent';
import type { DomainEventDispatcher } from '@/application/ports/output/DomainEventDispatcher';
import type { Json } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

/**
 * Infrastructure adapter: Persists domain events to the domain_events table.
 * Events are stored as immutable, append-only records for audit trail.
 */
export class PersistentDomainEventPublisher implements DomainEventDispatcher {
  async dispatch(event: DomainEvent): Promise<void> {
    try {
      const { error } = await supabase.functions.invoke('sync-router', {
        body: {
          action: 'log-domain-event',
          payload: {
            aggregate_id: event.aggregateId,
            aggregate_type: this.inferAggregateType(event.eventType),
            event_type: event.eventType,
            payload: this.buildPayload(event) as unknown as Json,
            occurred_on: event.occurredOn.toISOString(),
            tenant_id: this.extractTenantId(event),
          },
        },
      });

      if (error) {
        logger.error('[PersistentDomainEventPublisher] Failed to persist event', { error: error.message });
      }
    } catch (err) {
      logger.error('[PersistentDomainEventPublisher] Unexpected error', err instanceof Error ? err : undefined);
      // Don't throw — event publishing should not fail the business operation
    }
  }

  async dispatchAll(events: DomainEvent[]): Promise<void> {
    if (events.length === 0) return;

    try {
      const rows = events.map(event => ({
        aggregate_id: event.aggregateId,
        aggregate_type: this.inferAggregateType(event.eventType),
        event_type: event.eventType,
        payload: this.buildPayload(event) as unknown as Json,
        occurred_on: event.occurredOn.toISOString(),
        tenant_id: this.extractTenantId(event),
      }));

      const { error } = await supabase.functions.invoke('sync-router', {
        body: { action: 'log-domain-event', payload: rows },
      });

      if (error) {
        logger.error('[PersistentDomainEventPublisher] Failed to persist events', { error: error.message });
      }
    } catch (err) {
      logger.error('[PersistentDomainEventPublisher] Unexpected error', err instanceof Error ? err : undefined);
    }
  }

  private inferAggregateType(eventType: string): string {
    if (eventType.startsWith('agent.')) return 'agent';
    if (eventType.startsWith('job.')) return 'job';
    if (eventType.startsWith('update.') || eventType.includes('Update')) return 'update_package';
    return 'unknown';
  }

  private buildPayload(event: DomainEvent): Record<string, unknown> {
    const { eventType, occurredOn, aggregateId, ...rest } = event as DomainEvent & Record<string, unknown>;
    return rest as Record<string, unknown>;
  }

  private extractTenantId(event: DomainEvent): string | null {
    const e = event as DomainEvent & Record<string, unknown>;
    const tenantId = e.tenantId as { value?: string } | string | undefined;
    if (typeof tenantId === 'object' && tenantId?.value) return String(tenantId.value);
    if (typeof tenantId === 'string') return tenantId;
    return null;
  }
}
