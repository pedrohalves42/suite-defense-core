import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from './logger.ts';

// Type-only narrowing helpers (D12-B8). No runtime/contract change.
function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
function asPayload(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function asDateInput(value: unknown): string | number | Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return value;
  // Preserve previous behavior: passing through to new Date() would yield Invalid Date.
  // We surface that by returning NaN so new Date(NaN) === Invalid Date (same observable outcome).
  return NaN as unknown as number;
}

/**
 * Domain Event Dispatcher for Edge Functions.
 * Persists events to the immutable domain_events table.
 */
export class EdgeDomainEventDispatcher {
  private supabase;

  constructor() {
    this.supabase = createClient<any>(
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
      .select('aggregate_id, aggregate_type, event_type, payload, occurred_on, tenant_id')
      .eq('aggregate_id', aggregateId)
      .order('occurred_on', { ascending: true });

    if (fromDate) {
      query = query.gte('occurred_on', fromDate.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((row: Record<string, unknown>) => ({
      aggregateId: asString(row.aggregate_id),
      aggregateType: asString(row.aggregate_type),
      eventType: asString(row.event_type),
      payload: asPayload(row.payload),
      occurredOn: new Date(asDateInput(row.occurred_on)),
      tenantId: asOptionalString(row.tenant_id),
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
