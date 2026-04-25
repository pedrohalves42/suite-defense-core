/**
 * Handler: rollback event submission (migrated from submit-rollback-event)
 * Requires agentData.agent_version from extraAgentFields.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../logger.ts';

export async function handleRollbackEvent(
  supabase: any,
  agentId: string,
  agentName: string,
  tenantId: string,
  requestId: string,
  body: Record<string, unknown>,
  agentData?: Record<string, unknown>,
): Promise<Response | Record<string, unknown>> {
  const startTime = Date.now();

  const fromVersion = body.from_version as string;
  const toVersion = body.to_version as string;
  const reason = body.reason as string;
  const safeMode = (body.safe_mode_triggered as boolean) ?? false;
  const hostname = body.hostname as string | undefined;
  const details = (body.details as Record<string, unknown>) ?? {};

  if (!fromVersion || !toVersion || !reason) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: from_version, to_version, reason' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Check recent rollback count
  const { data: recentRollback } = await supabase
    .from('agent_rollback_events')
    .select('id, rollback_count')
    .eq('agent_id', agentId)
    .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const rollbackCount = recentRollback ? (recentRollback.rollback_count as number) + 1 : 1;

  const { data: rollbackEvent, error: insertError } = await supabase
    .from('agent_rollback_events')
    .insert({
      agent_id: agentId,
      agent_name: agentName,
      tenant_id: tenantId,
      from_version: fromVersion,
      to_version: toVersion,
      reason,
      rollback_count: rollbackCount,
      safe_mode_triggered: safeMode,
      details: {
        ...details,
        hostname,
        reported_at: new Date().toISOString(),
        agent_version_current: agentData?.agent_version ?? null,
      },
    })
    .select('id')
    .single();

  if (insertError) {
    logger.error(`[${requestId}] Failed to insert rollback event`, { error: insertError.message });
    return new Response(JSON.stringify({ error: 'Failed to store rollback event' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (safeMode) {
    await supabase.from('system_alerts').insert({
      tenant_id: tenantId,
      agent_id: agentId,
      alert_type: 'agent_safe_mode',
      severity: 'critical',
      message: `Agent "${agentName}" entered SAFE MODE after ${rollbackCount} consecutive rollbacks. Auto-updates disabled.`,
      resolved: false,
    });
    logger.warn(`[${requestId}] Agent entered SAFE MODE`, { agentName, rollbackCount });
  }

  return {
    success: true,
    event_id: rollbackEvent?.id,
    rollback_count: rollbackCount,
    safe_mode_triggered: safeMode,
    elapsed_ms: Date.now() - startTime,
  };
}
