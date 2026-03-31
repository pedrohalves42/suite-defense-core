/**
 * submit-rollback-event — Migrated to serveAgent middleware with HMAC verification.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, requestId, body, agentData } = ctx;
  const startTime = Date.now();

  const {
    from_version,
    to_version,
    reason,
    safe_mode_triggered = false,
    hostname,
    details = {},
  } = body as Record<string, unknown>;

  // Validate required fields
  if (!from_version || !to_version || !reason) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: from_version, to_version, reason' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const validReasons = ['health_check_failed', 'crash_detected', 'state_machine_invalid', 'heartbeat_failed', 'manual_rollback'];
  if (!validReasons.includes(reason as string)) {
    return new Response(
      JSON.stringify({ error: `Invalid reason. Must be one of: ${validReasons.join(', ')}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
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
      from_version,
      to_version,
      reason,
      rollback_count: rollbackCount,
      safe_mode_triggered,
      details: {
        ...(details as Record<string, unknown>),
        hostname,
        reported_at: new Date().toISOString(),
        agent_version_current: agentData.agent_version ?? null,
      },
    })
    .select()
    .single();

  if (insertError) {
    logger.error('[submit-rollback-event] Failed to insert', { requestId, error: insertError.message });
    throw insertError;
  }

  // Create system alert if safe mode triggered
  if (safe_mode_triggered) {
    await supabase.from('system_alerts').insert({
      tenant_id: tenantId,
      agent_id: agentId,
      alert_type: 'agent_safe_mode',
      severity: 'critical',
      message: `Agent "${agentName}" entered SAFE MODE after ${rollbackCount} consecutive rollbacks. Auto-updates disabled.`,
      resolved: false,
    });
    logger.warn('[submit-rollback-event] Agent entered SAFE MODE', { requestId, agentName, rollbackCount });
  }

  return {
    success: true,
    event_id: rollbackEvent.id,
    rollback_count: rollbackCount,
    safe_mode_triggered,
    elapsed_ms: Date.now() - startTime,
  };
}, {
  hmacVerify: true,
  extraAgentFields: ['agent_version'],
});
