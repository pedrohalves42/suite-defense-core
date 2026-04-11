/**
 * submit-endpoint-events — EDR Telemetry Ingestion
 * 
 * Receives process, file, network, and registry events from agents.
 * Uses buffer pattern: fast insert into endpoint_event_buffer,
 * then async fan-out to typed tables.
 * 
 * Single auth via serveAgent — no proxy hops.
 */

import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

// ── Schema ──────────────────────────────────────────────────────────────

const EventSchema = z.object({
  event_type: z.string().min(1).max(100),
  event_time: z.string().optional(),
}).passthrough();

const PayloadSchema = z.object({
  events: z.array(EventSchema).min(1).max(500),
  batch_id: z.string().optional(),
}).passthrough();

// ── Event classification ────────────────────────────────────────────────

type EventCategory = 'process' | 'file' | 'network' | 'registry';

const EVENT_TYPE_MAP: Record<string, EventCategory> = {
  process_start: 'process', process_stop: 'process', process_inject: 'process',
  file_create: 'file', file_modify: 'file', file_delete: 'file', file_rename: 'file',
  connection: 'network', listen: 'network', dns_query: 'network',
  registry_set: 'registry', registry_create: 'registry', registry_delete: 'registry',
  registry_snapshot: 'registry',
};

function classifyEvent(eventType: string): EventCategory {
  return EVENT_TYPE_MAP[eventType] || 'process';
}

// ── Table mapping (typed tables) ────────────────────────────────────────

const TABLE_MAP: Record<EventCategory, string> = {
  process: 'endpoint_process_events',
  file: 'endpoint_file_events',
  network: 'endpoint_network_events',
  registry: 'endpoint_registry_events',
};

// Column whitelists per table to prevent injection of unknown columns
const COLUMNS: Record<EventCategory, string[]> = {
  process: [
    'agent_id', 'tenant_id', 'event_type', 'pid', 'parent_pid', 'process_name',
    'command_line', 'executable_path', 'user_name', 'sha256_hash',
    'parent_process_name', 'parent_command_line', 'mitre_technique_id',
    'mitre_tactic', 'is_suspicious', 'detection_tags', 'event_time',
  ],
  file: [
    'agent_id', 'tenant_id', 'event_type', 'file_path', 'file_name',
    'file_extension', 'file_size', 'sha256_hash', 'old_path',
    'process_name', 'process_pid', 'is_suspicious', 'detection_tags', 'event_time',
  ],
  network: [
    'agent_id', 'tenant_id', 'event_type', 'protocol', 'local_address',
    'local_port', 'remote_address', 'remote_port', 'direction',
    'process_name', 'process_pid', 'bytes_sent', 'bytes_received',
    'domain', 'dns_query_type', 'dns_response', 'is_suspicious',
    'detection_tags', 'geo_country', 'event_time',
  ],
  registry: [
    'agent_id', 'tenant_id', 'event_type', 'key_path', 'value_name',
    'value_data', 'value_type', 'old_value_data', 'process_name',
    'process_pid', 'is_suspicious', 'detection_tags', 'mitre_technique_id',
    'event_time',
  ],
};

function pickColumns(event: Record<string, unknown>, category: EventCategory, agentId: string, tenantId: string): Record<string, unknown> {
  const allowed = COLUMNS[category];
  const row: Record<string, unknown> = { agent_id: agentId, tenant_id: tenantId };
  for (const col of allowed) {
    if (col === 'agent_id' || col === 'tenant_id') continue;
    if (event[col] !== undefined) row[col] = event[col];
  }
  // Defaults
  if (!row.event_time) row.event_time = new Date().toISOString();
  if (row.is_suspicious === undefined) row.is_suspicious = false;
  if (row.detection_tags === undefined) row.detection_tags = [];
  return row;
}

// ── Handler ─────────────────────────────────────────────────────────────

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, tenantId, requestId, body } = ctx;

  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    // Fallback: wrap entire body as single-event batch if events array missing
    const events = (body as Record<string, unknown>).events;
    if (!events) {
      // Legacy: body IS the event list or a single event
      const evtArray = Array.isArray(body) ? body : [body];
      if (evtArray.length === 0 || !evtArray[0]?.event_type) {
        return new Response(
          JSON.stringify({ error: 'Invalid payload', details: 'Expected { events: [...] } or array of events with event_type' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return await processEvents(supabase, agentId, tenantId, requestId, evtArray as Record<string, unknown>[], undefined);
    }
    return new Response(
      JSON.stringify({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return await processEvents(supabase, agentId, tenantId, requestId, parsed.data.events as Record<string, unknown>[], parsed.data.batch_id);
});

// ── Core processing ─────────────────────────────────────────────────────

async function processEvents(
  supabase: import('https://esm.sh/@supabase/supabase-js@2.74.0').SupabaseClient,
  agentId: string,
  tenantId: string,
  requestId: string,
  events: Record<string, unknown>[],
  batchId: string | undefined,
): Promise<Record<string, unknown>> {
  const now = new Date().toISOString();
  const stats = { received: events.length, buffered: 0, direct: 0, errors: 0 };

  // Group events by category
  const grouped: Record<EventCategory, Record<string, unknown>[]> = {
    process: [], file: [], network: [], registry: [],
  };

  for (const event of events) {
    const category = classifyEvent(event.event_type as string);
    const row = pickColumns(event, category, agentId, tenantId);
    grouped[category].push(row);
  }

  // Batch insert into typed tables (parallel)
  const insertOps = (Object.entries(grouped) as [EventCategory, Record<string, unknown>[]][])
    .filter(([, rows]) => rows.length > 0)
    .map(async ([category, rows]) => {
      const table = TABLE_MAP[category];
      const { error } = await supabase.from(table).insert(rows);
      if (error) {
        logger.error(`[${requestId}] Insert ${table} failed: ${error.message}`);
        stats.errors += rows.length;

        // Fallback: buffer for async processing
        const bufferRows = rows.map(row => ({
          agent_id: agentId,
          tenant_id: tenantId,
          event_category: category,
          payload: row,
          batch_id: batchId || null,
          received_at: now,
        }));
        const { error: bufErr } = await supabase.from('endpoint_event_buffer').insert(bufferRows);
        if (bufErr) {
          logger.error(`[${requestId}] Buffer fallback also failed: ${bufErr.message}`);
        } else {
          stats.buffered += rows.length;
          stats.errors -= rows.length; // recovered
        }
      } else {
        stats.direct += rows.length;
      }
    });

  await Promise.all(insertOps);

  logger.info(`[${requestId}] EDR ingested: ${stats.direct} direct, ${stats.buffered} buffered, ${stats.errors} errors from ${stats.received} events (agent=${agentId})`);

  return {
    success: stats.errors === 0,
    received: stats.received,
    processed: stats.direct + stats.buffered,
    buffered: stats.buffered,
    errors: stats.errors,
  };
}
