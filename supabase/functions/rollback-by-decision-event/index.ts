/**
 * Rollback by Decision Event - Migrated to serveTenant middleware
 * Reverts a past decision based on a decision_event,
 * recording a new rollback decision_event for audit.
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const RollbackSchema = z.object({
  decision_event_id: z.string().uuid('decision_event_id must be a valid UUID'),
  reason: z.string().max(1000).optional(),
});

serveTenant(async (_req, ctx) => {
  const { supabase, userId, tenantId, requestId, body } = ctx;

  const parsed = RollbackSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { decision_event_id, reason } = parsed.data;

  // Only admins can rollback decisions
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .in('role', ['admin', 'super_admin'])
    .limit(1)
    .maybeSingle();

  if (!userRole) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: Only admins can rollback decisions' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 1. Fetch decision_event — filter by caller's tenant_id
  const { data: event, error } = await supabase
    .from('decision_events')
    .select('*')
    .eq('id', decision_event_id)
    .eq('tenant_id', tenantId)
    .single();

  if (error || !event) {
    logger.warn('Decision event not found or access denied', { decision_event_id, tenant_id: tenantId });
    return new Response(
      JSON.stringify({ error: 'Decision event not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Only allow rollback of alert_resolution
  if (event.decision_type !== 'alert_resolution') {
    return new Response(
      JSON.stringify({
        error: 'Rollback not supported for this decision type',
        decision_type: event.decision_type,
        supported_types: ['alert_resolution'],
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const alertId = event.evidence?.alert_id;
  if (!alertId) {
    return new Response(
      JSON.stringify({ error: 'No alert_id in decision evidence' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 2. Check if rollback already executed
  const { count } = await supabase
    .from('decision_events')
    .select('*', { count: 'exact', head: true })
    .eq('decision_type', 'rollback')
    .eq('tenant_id', tenantId)
    .filter('evidence->>original_decision_event_id', 'eq', decision_event_id);

  if (count && count > 0) {
    return new Response(
      JSON.stringify({ error: 'Rollback already executed for this decision' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 3. Revert alert — filter by tenant_id
  const { error: revertError } = await supabase
    .from('system_alerts')
    .update({ resolved: false, resolved_at: null })
    .eq('id', alertId)
    .eq('tenant_id', tenantId);

  if (revertError) {
    logger.error('Failed to revert alert', revertError);
    throw revertError;
  }

  // 4. Record rollback decision event
  const { error: rollbackEventError } = await supabase
    .from('decision_events')
    .insert({
      tenant_id: tenantId,
      rule_code: 'ROLLBACK',
      decision_source: 'human',
      decision_type: 'rollback',
      action: 'rollback_alert_resolution',
      evidence: {
        alert_id: alertId,
        original_decision_event_id: decision_event_id,
        original_action: event.action,
        original_rule_code: event.rule_code,
        reason: reason ?? 'Manual rollback via API',
        user_id: userId,
      },
      actions_executed: [{ type: 'alert_reopened', success: true }],
      created_at: new Date().toISOString(),
    });

  if (rollbackEventError) {
    logger.error('Failed to create rollback decision event', rollbackEventError);
  }

  logger.info(`[${requestId}] Rollback executed successfully`, {
    decision_event_id,
    alertId,
    reason,
    user_id: userId,
    tenant_id: tenantId,
  });

  return {
    status: 'rollback_executed',
    alert_id: alertId,
    original_decision_event_id: decision_event_id,
    message: 'Alert reopened and rollback decision event created',
  };
}, { methods: ['POST'] });
