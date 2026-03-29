import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from './logger.ts';

/**
 * Domain Event Dispatcher for Edge Functions.
 * Persists events to the immutable domain_events table.
 */
export class EdgeDomainEventDispatcher {
  private supabase;

  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
  }

  async dispatch(event: EdgeDomainEvent): Promise<void> {
    try {
      const { error } = await this.supabase.from('domain_events').insert({
        aggregate_id: event.aggregateId,
        aggregate_type: event.aggregateType,
        event_type: event.eventType,
        payload: event.payload,
        occurred_on: event.occurredOn.toISOString(),
        tenant_id: event.tenantId || null,
      });

      if (error) {
        logger.error('[DomainEventDispatcher] Failed to persist event:', error.message);
      }
    } catch (err) {
      // Domain events are best-effort - don't break business logic
      logger.error('[DomainEventDispatcher] Exception:', (err as Error).message);
    }
  }

  async replayEvents(aggregateId: string, fromDate?: Date): Promise<EdgeDomainEvent[]> {
    let query = this.supabase
      .from('domain_events')
      .select('*')
      .eq('aggregate_id', aggregateId)
      .order('occurred_on', { ascending: true });

    if (fromDate) {
      query = query.gte('occurred_on', fromDate.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((row: Record<string, unknown>) => ({
      aggregateId: row.aggregate_id,
      aggregateType: row.aggregate_type,
      eventType: row.event_type,
      payload: row.payload,
      occurredOn: new Date(row.occurred_on),
      tenantId: row.tenant_id,
    }));
  }
}

export interface EdgeDomainEvent {
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredOn: Date;
  tenantId?: string;
}
