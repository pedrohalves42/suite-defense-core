/**
 * Handler: endpoint events submission (EDR telemetry)
 * Inlined processing — NO proxy. Supports v5 and v6 payload formats.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';

type EventCategory = 'process' | 'file' | 'network' | 'registry';

const TABLE_MAP: Record<EventCategory, string> = {
  process: 'endpoint_process_events',
  file: 'endpoint_file_events',
  network: 'endpoint_network_events',
  registry: 'endpoint_registry_events',
};

const COLUMNS: Record<EventCategory, string[]> = {
  process: [
    'event_type', 'pid', 'parent_pid', 'process_name',
    'command_line', 'executable_path', 'user_name', 'sha256_hash',
    'parent_process_name', 'parent_command_line', 'mitre_technique_id',
    'mitre_tactic', 'is_suspicious', 'detection_tags', 'event_time',
  ],
  file: [
    'event_type', 'file_path', 'file_name',
    'file_extension', 'file_size', 'sha256_hash', 'old_path',
    'process_name', 'process_pid', 'is_suspicious', 'detection_tags', 'event_time',
  ],
  network: [
    'event_type', 'protocol', 'local_address',
    'local_port', 'remote_address', 'remote_port', 'direction',
    'process_name', 'process_pid', 'bytes_sent', 'bytes_received',
    'domain', 'dns_query_type', 'dns_response', 'is_suspicious',
    'detection_tags', 'geo_country', 'event_time',
  ],
  registry: [
    'event_type', 'key_path', 'value_name',
    'value_data', 'value_type', 'old_value_data', 'process_name',
    'process_pid', 'is_suspicious', 'detection_tags', 'mitre_technique_id',
    'event_time',
  ],
};

const EVENT_TYPE_MAP: Record<string, EventCategory> = {
  process_start: 'process', process_stop: 'process', process_inject: 'process',
  file_create: 'file', file_modify: 'file', file_delete: 'file', file_rename: 'file',
  connection: 'network', listen: 'network', dns_query: 'network',
  connection_established: 'network', port_listen: 'network',
  registry_set: 'registry', registry_create: 'registry', registry_delete: 'registry',
  registry_snapshot: 'registry', registry_value_set: 'registry', registry_value_delete: 'registry',
};

const V5_FIELD_MAP: Record<string, string> = {
  pid: 'process_pid',
  parent_pid: 'parent_pid',
  src_address: 'local_address',
  dst_address: 'remote_address',
  src_port: 'local_port',
  dst_port: 'remote_port',
};

function normalizeEvent(event: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(event)) {
    const mapped = V5_FIELD_MAP[key];
    if (mapped && out[mapped] === undefined) {
      out[mapped] = value;
    }
    if (out[key] === undefined) {
      out[key] = value;
    }
  }
  return out;
}

function pickColumns(event: Record<string, unknown>, category: EventCategory, agentId: string, tenantId: string): Record<string, unknown> {
  const normalized = normalizeEvent(event);
  const allowed = COLUMNS[category];
  const row: Record<string, unknown> = { agent_id: agentId, tenant_id: tenantId };
  for (const col of allowed) {
    if (normalized[col] !== undefined) row[col] = normalized[col];
  }
  if (!row.event_time) row.event_time = new Date().toISOString();
  if (row.is_suspicious === undefined) row.is_suspicious = false;
  if (row.detection_tags === undefined) row.detection_tags = [];
  return row;
}

export async function handleEndpointEvents(
  supabase: SupabaseClient,
  agentId: string,
  _agentName: string,
  tenantId: string,
  requestId: string,
  body: Record<string, unknown>,
): Promise<Response | Record<string, unknown>> {
  const grouped: Record<EventCategory, Record<string, unknown>[]> = {
    process: [], file: [], network: [], registry: [],
  };

  let totalEvents = 0;
  let isV5Format = false;

  // v5 format: { process_events: [], network_events: [], ... }
  const v5Keys: [string, EventCategory][] = [
    ['process_events', 'process'],
    ['network_events', 'network'],
    ['file_events', 'file'],
    ['registry_events', 'registry'],
  ];

  for (const [key, category] of v5Keys) {
    const arr = body[key];
    if (Array.isArray(arr) && arr.length > 0) {
      isV5Format = true;
      for (const event of arr) {
        if (typeof event === 'object' && event !== null) {
          grouped[category].push(pickColumns(event as Record<string, unknown>, category, agentId, tenantId));
          totalEvents++;
        }
      }
    }
  }

  // v6 format: { events: [{ event_type: "...", ... }] }
  if (!isV5Format && Array.isArray(body.events)) {
    for (const event of body.events) {
      if (typeof event !== 'object' || event === null) continue;
      const evt = event as Record<string, unknown>;
      const eventType = evt.event_type as string;
      if (!eventType) continue;
      const category = EVENT_TYPE_MAP[eventType] || 'process';
      grouped[category].push(pickColumns(evt, category, agentId, tenantId));
      totalEvents++;
    }
  }

  // Single event
  if (!isV5Format && !Array.isArray(body.events) && body.event_type) {
    const category = EVENT_TYPE_MAP[body.event_type as string] || 'process';
    grouped[category].push(pickColumns(body, category, agentId, tenantId));
    totalEvents++;
  }

  if (totalEvents === 0) {
    return { success: true, received: 0, processed: 0 };
  }

  if (totalEvents > 1000) {
    return new Response(
      JSON.stringify({ error: 'Batch too large', max: 1000 }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const now = new Date().toISOString();
  const batchId = (body.batch_id as string) || undefined;
  const stats = { received: totalEvents, direct: 0, buffered: 0, errors: 0 };

  const ops = (Object.entries(grouped) as [EventCategory, Record<string, unknown>[]][])
    .filter(([, rows]) => rows.length > 0)
    .map(async ([category, rows]) => {
      const table = TABLE_MAP[category];
      const { error } = await supabase.from(table).insert(rows);
      if (error) {
        logger.error(`[${requestId}] Insert ${table}: ${error.message}`);
        stats.errors += rows.length;
        const bufferRows = rows.map(row => ({
          agent_id: agentId, tenant_id: tenantId,
          event_category: category, payload: row,
          batch_id: batchId || null, received_at: now,
        }));
        const { error: bufErr } = await supabase.from('endpoint_event_buffer').insert(bufferRows);
        if (!bufErr) { stats.buffered += rows.length; stats.errors -= rows.length; }
        else logger.error(`[${requestId}] Buffer fallback failed: ${bufErr.message}`);
      } else {
        stats.direct += rows.length;
      }
    });

  await Promise.all(ops);

  logger.info(`[${requestId}] EDR: ${stats.direct} direct, ${stats.buffered} buffered, ${stats.errors} err (agent=${agentId})`);

  return {
    success: stats.errors === 0,
    received: stats.received,
    processed: stats.direct + stats.buffered,
    buffered: stats.buffered,
    errors: stats.errors,
  };
}
