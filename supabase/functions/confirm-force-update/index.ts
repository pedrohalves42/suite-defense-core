/**
 * confirm-force-update — Migrated to serveAgent middleware.
 * NOTE: HMAC is optional for this endpoint (token-only fallback for pre-hotfix agents).
 * Uses serveAgent without hmacVerify, performs optional HMAC check internally.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { normalizeVersion } from '../_shared/hexagonal/update-decision-service.ts';
import { logger } from '../_shared/logger.ts';

serveAgent(async (req, ctx) => {
  const { supabase, agentId, agentName, tenantId, hmacSecret, requestId, body, agentData } = ctx;

  // Optional HMAC verification (non-blocking for pre-hotfix agents)
  const signature = req.headers.get('X-HMAC-Signature');
  const hmacTimestamp = req.headers.get('X-HMAC-Timestamp') || req.headers.get('X-Timestamp');
  const hmacNonce = req.headers.get('X-HMAC-Nonce') || req.headers.get('X-Nonce');
  const hasHmacHeaders = !!(signature && hmacTimestamp && hmacNonce);

  if (hasHmacHeaders && hmacSecret) {
    try {
      const { verifyHmacSignature } = await import('../_shared/hmac.ts');
      const hmacResult = await verifyHmacSignature(supabase, req, agentName, hmacSecret, {
        agentId, tenantId, endpoint: 'confirm-force-update',
      });
      if (!hmacResult.valid) {
        logger.warn('[confirm-force-update] HMAC failed, accepting token-only', { requestId, errorCode: hmacResult.errorCode, agentName });
      }
    } catch { /* HMAC check is best-effort */ }
  }

  const { new_version, old_version } = body as { new_version?: string; old_version?: string };

  if (!new_version) {
    return new Response(JSON.stringify({ error: 'new_version is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const currentNorm = normalizeVersion(agentData.agent_version as string | null);
  const newNorm = normalizeVersion(new_version);
  const targetNorm = normalizeVersion(agentData.force_update_version as string | null);
  const deliveryCount = (agentData.force_update_delivered_count as number) ?? (agentData.force_update_delivery_count as number) ?? 0;
  const nowIso = new Date().toISOString();

  // GUARD 1: Idempotency
  if (currentNorm === newNorm && !agentData.force_update_version) {
    return { success: true, message: 'Already confirmed (idempotent)', agent_name: agentName, new_version, idempotent: true };
  }

  // GUARD 2: Mismatch
  if (targetNorm && newNorm !== targetNorm) {
    return new Response(JSON.stringify({
      error: 'Reported version does not match pending force update target',
      agent_name: agentName, current_version: agentData.agent_version, target_version: agentData.force_update_version, reported_version: new_version,
    }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  }

  // Version not yet confirmed by heartbeat
  if (currentNorm !== newNorm) {
    await supabase.from('agent_evidence_logs').insert({
      agent_id: agentId, agent_name: agentName, agent_version: agentData.agent_version as string, tenant_id: tenantId,
      event_type: 'force_update_staged',
      event_data: { old_version: old_version || agentData.agent_version, new_version, pending_target_version: agentData.force_update_version, delivery_count: deliveryCount, staged_at: nowIso, waiting_for_post_update_heartbeat: true },
      evidence_hash: crypto.randomUUID(), severity: 'info',
    });

    return new Response(JSON.stringify({
      success: true, message: 'Force update staged; waiting for heartbeat', agent_name: agentName,
      current_version: agentData.agent_version, new_version, awaiting_heartbeat: true,
    }), { status: 202, headers: { 'Content-Type': 'application/json' } });
  }

  // Clear force update
  await supabase.from('agents').update({
    force_update_version: null, force_update_reason: null, force_update_at: null,
    force_update_delivery_count: 0, force_update_delivered_count: 0, force_update_first_delivered_at: null,
    last_forced_update_applied: nowIso,
  }).eq('id', agentId);

  await supabase.from('agent_evidence_logs').insert({
    agent_id: agentId, agent_name: agentName, agent_version: new_version, tenant_id: tenantId,
    event_type: 'force_update_applied',
    event_data: { old_version: old_version || agentData.agent_version, new_version, was_force_update: !!agentData.force_update_version, delivery_count: deliveryCount, applied_at: nowIso },
    evidence_hash: crypto.randomUUID(), severity: 'info',
  });

  return { success: true, message: 'Force update confirmed', agent_name: agentName, new_version, old_version: old_version || agentData.agent_version };
}, {
  extraAgentFields: ['agent_version', 'force_update_version', 'force_update_reason', 'force_update_delivery_count', 'force_update_delivered_count'],
});
