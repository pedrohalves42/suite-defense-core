/**
 * Handler: antivirus status submission (migrated from submit-antivirus-status)
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../logger.ts';

interface AvItem {
  engine_name: string;
  engine_version?: string;
  status?: string;
  last_update_at?: string;
  last_scan_at?: string;
  threats_found?: number;
  raw_data?: unknown;
}

export async function handleAntivirusStatus(
  supabase: SupabaseClient,
  agentId: string,
  _agentName: string,
  tenantId: string,
  requestId: string,
  body: Record<string, unknown>,
): Promise<Response | Record<string, unknown>> {
  const { agent_id, items } = body as { agent_id?: string; items?: AvItem[] };

  const effectiveAgentId = agent_id || agentId;

  if (!Array.isArray(items) || items.length === 0) {
    return { success: true, inserted: 0 };
  }

  logger.info(`[${requestId}] Storing ${items.length} AV status items`);

  // Clear old status
  await supabase.from('antivirus_status').delete().eq('agent_id', effectiveAgentId);

  const itemsToInsert = items.map(item => ({
    tenant_id: tenantId,
    agent_id: effectiveAgentId,
    engine_name: item.engine_name,
    engine_version: item.engine_version || null,
    status: item.status || null,
    last_update_at: item.last_update_at ? new Date(item.last_update_at).toISOString() : null,
    last_scan_at: item.last_scan_at ? new Date(item.last_scan_at).toISOString() : null,
    threats_found: item.threats_found ?? null,
    raw_data: item.raw_data || {},
  }));

  const { error: insertError } = await supabase.from('antivirus_status').insert(itemsToInsert);

  if (insertError) {
    logger.error(`[${requestId}] Failed to insert AV status`, insertError);
    return new Response(JSON.stringify({ error: 'Failed to store AV status' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return { success: true, inserted: items.length };
}
