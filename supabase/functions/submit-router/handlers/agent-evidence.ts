/**
 * Handler: agent evidence submission
 * Extracted from submit-agent-evidence/index.ts
 * 
 * NOTE: Depends on normalization.ts from the original function.
 * For the router, we inline the normalization logic to avoid cross-function imports.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';

const VALID_EVENT_TYPES = new Set([
  'state_change', 'job_execution', 'dns_block', 'policy_sync', 'auto_recovery',
  'heartbeat', 'update_applied', 'error', 'policy_drift', 'security_event', 'auto_repair',
]);
const VALID_SEVERITIES = new Set(['debug', 'info', 'warning', 'error', 'critical']);

function pickString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function toRecord(...candidates: unknown[]): Record<string, unknown> {
  for (const c of candidates) {
    if (c && typeof c === 'object' && !Array.isArray(c)) return { ...(c as Record<string, unknown>) };
  }
  return {};
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function normalizeEntry(
  raw: Record<string, unknown>,
  agentName: string,
  agentVersion: string | null,
) {
  const rawType = pickString(raw.event_type) ?? pickString(raw.type) ?? 'security_event';
  const normalizedType = VALID_EVENT_TYPES.has(rawType) ? rawType : 'security_event';
  const severity = pickString(raw.severity) && VALID_SEVERITIES.has(raw.severity as string) ? raw.severity as string : 'info';
  const timestamp = pickString(raw.timestamp);
  const name = pickString(raw.agent_name) ?? agentName;
  const version = pickString(raw.agent_version) ?? agentVersion;
  const baseEventData = toRecord(raw.event_data, raw.data);
  const eventData: Record<string, unknown> = { ...baseEventData };
  if (timestamp && eventData.timestamp === undefined) eventData.timestamp = timestamp;
  if (normalizedType === 'security_event' && rawType !== normalizedType && eventData.source_event_type === undefined) {
    eventData.source_event_type = rawType;
  }
  const evidenceHash = pickString(raw.evidence_hash) ?? await sha256Hex(JSON.stringify({
    agent_name: name, agent_version: version, event_type: rawType, event_data: eventData,
    state_before: pickString(raw.state_before), state_after: pickString(raw.state_after), severity, timestamp: timestamp ?? null,
  }));

  return {
    agent_name: name, agent_version: version, event_type: normalizedType, event_data: eventData,
    evidence_hash: evidenceHash, state_before: pickString(raw.state_before), state_after: pickString(raw.state_after), severity,
  };
}

export async function handleAgentEvidence(
  supabase: SupabaseClient,
  agentId: string,
  agentName: string,
  tenantId: string,
  requestId: string,
  body: Record<string, unknown>,
): Promise<Response | Record<string, unknown>> {
  let rawEntries: Record<string, unknown>[];
  if (Array.isArray(body.entries) && (body.entries as unknown[]).length > 0) {
    rawEntries = (body.entries as Record<string, unknown>[]).slice(0, 100);
  } else if (body.event_type || body.event_name) {
    rawEntries = [body];
  } else {
    return new Response(
      JSON.stringify({ error: 'Missing or empty entries array' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const agentVersion = typeof body.agent_version === 'string' ? body.agent_version : null;
  const normalizedEntries = await Promise.all(
    rawEntries.map((entry) => normalizeEntry(entry, typeof body.agent_name === 'string' ? body.agent_name : agentName, agentVersion)),
  );

  const records = normalizedEntries.map((entry) => ({
    tenant_id: tenantId, agent_id: agentId, agent_name: entry.agent_name,
    agent_version: entry.agent_version, event_type: entry.event_type, event_data: entry.event_data,
    evidence_hash: entry.evidence_hash, state_before: entry.state_before, state_after: entry.state_after,
    severity: entry.severity,
  }));

  const { data: insertedData, error: insertError } = await supabase
    .from('agent_evidence_logs').insert(records).select('id');

  if (insertError) {
    logger.error(`[${requestId}] Insert error:`, insertError.message);
    return new Response(
      JSON.stringify({ error: 'Failed to store evidence' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return { success: true, stored_count: insertedData?.length || records.length, agent_name: agentName };
}
