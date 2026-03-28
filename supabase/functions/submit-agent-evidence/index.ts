/**
 * submit-agent-evidence: Receives forensic evidence entries from agents
 * Migrated to serveAgent middleware
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { normalizeEvidenceEntry } from './normalization.ts';
import { logger } from '../_shared/logger.ts';

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, requestId, body } = ctx;
  const payload = body as Record<string, unknown>;

  let rawEntries: Record<string, unknown>[];
  if (Array.isArray(payload.entries) && payload.entries.length > 0) {
    rawEntries = (payload.entries as Record<string, unknown>[]).slice(0, 100);
  } else if (payload.event_type || payload.event_name) {
    rawEntries = [payload];
  } else {
    return new Response(
      JSON.stringify({ error: 'Missing or empty entries array' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const normalizedEntries = await Promise.all(
    rawEntries.map((entry) =>
      normalizeEvidenceEntry(entry, {
        agent_name: typeof payload.agent_name === 'string' ? payload.agent_name : agentName,
        agent_version: typeof payload.agent_version === 'string' ? payload.agent_version : null,
      })
    )
  );

  const records = normalizedEntries.map((entry) => ({
    tenant_id: tenantId,
    agent_id: agentId,
    agent_name: entry.agent_name,
    agent_version: entry.agent_version,
    event_type: entry.event_type,
    event_data: entry.event_data,
    evidence_hash: entry.evidence_hash,
    state_before: entry.state_before,
    state_after: entry.state_after,
    severity: entry.severity,
  }));

  const { data: insertedData, error: insertError } = await supabase
    .from('agent_evidence_logs')
    .insert(records)
    .select('id');

  if (insertError) {
    logger.error(`[${requestId}] Insert error:`, insertError.message);
    return new Response(
      JSON.stringify({ error: 'Failed to store evidence' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return {
    success: true,
    stored_count: insertedData?.length || records.length,
    agent_name: agentName,
  };
});
