/**
 * publish-threat-ioc - Publishes IoCs to collective threat network
 * Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

interface ThreatIoC {
  type: 'file_hash_sha256' | 'file_hash_md5' | 'domain' | 'ip_address' | 'url';
  value: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  tags: string[];
  context: string;
  source_agent_id?: string;
  source_tenant_id?: string;
  metadata?: Record<string, unknown>;
}

interface PublishRequest {
  iocs: ThreatIoC[];
  detection_type: string;
  source_agent_name?: string;
}

serveInternal(async (_req, ctx) => {
  const { supabase, requestId, body } = ctx;

  const publishBody = body as PublishRequest;

  if (!publishBody?.iocs || !Array.isArray(publishBody.iocs) || publishBody.iocs.length === 0) {
    return new Response(JSON.stringify({ error: 'No IoCs provided' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const iocs = publishBody.iocs.slice(0, 100);
  logger.info(`[${requestId}] [publish-threat-ioc] Publishing ${iocs.length} IoCs from ${publishBody.detection_type}`);

  let reputationUpserted = 0;
  let indicatorsPublished = 0;

  // Step 1: Update global reputation table
  for (const ioc of iocs) {
    if (!ioc.value || ioc.value.length < 3 || ioc.value.length > 2048) continue;

    const { error: repError } = await supabase.from('threat_network_reputation').upsert({
      indicator_type: ioc.type, indicator_value: ioc.value.toLowerCase().trim(), severity: ioc.severity,
      confidence_score: Math.min(100, 50 + (ioc.severity === 'critical' ? 30 : ioc.severity === 'high' ? 20 : 10)),
      last_reported_at: new Date().toISOString(),
      source_context: { detection_type: publishBody.detection_type, tags: ioc.tags, last_source_agent: publishBody.source_agent_name || 'unknown', ...(ioc.metadata || {}) },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'indicator_type,indicator_value' });

    if (!repError) reputationUpserted++;

    if (ioc.source_tenant_id) {
      await supabase.rpc('increment_threat_reputation_count', { p_indicator_type: ioc.type, p_indicator_value: ioc.value.toLowerCase().trim(), p_tenant_id: ioc.source_tenant_id }).catch(() => {});
    }
  }

  // Step 2: Publish to all active tenants
  const { data: tenants, error: tenantsError } = await supabase.from('tenants').select('id').eq('is_active', true);
  if (!tenantsError && tenants && tenants.length > 0) {
    const indicatorRows: Array<Record<string, unknown>> = [];
    for (const tenant of tenants) {
      for (const ioc of iocs) {
        if (!ioc.value || ioc.value.length < 3) continue;
        indicatorRows.push({
          tenant_id: tenant.id, indicator_type: ioc.type, indicator_value: ioc.value.toLowerCase().trim(),
          severity: ioc.severity, source: 'cybershield_network', source_reference: `csn:${publishBody.detection_type}:${requestId}`,
          tags: [...(ioc.tags || []), 'cybershield_network', publishBody.detection_type],
          confidence_score: Math.min(100, 50 + (ioc.severity === 'critical' ? 30 : 20)),
          last_seen_at: new Date().toISOString(), is_active: true,
          metadata: { network_source: true, detection_type: publishBody.detection_type, source_agent: publishBody.source_agent_name, ...(ioc.metadata || {}) },
        });
      }
    }

    const batchSize = 200;
    for (let i = 0; i < indicatorRows.length; i += batchSize) {
      const batch = indicatorRows.slice(i, i + batchSize);
      const { error: upsertError } = await supabase.from('threat_indicators').upsert(batch, { onConflict: 'tenant_id,indicator_type,indicator_value,source', ignoreDuplicates: false });
      if (!upsertError) indicatorsPublished += batch.length;
    }
  }

  const result = { success: true, request_id: requestId, iocs_received: iocs.length, reputation_upserted: reputationUpserted, indicators_published: indicatorsPublished, tenants_notified: tenants?.length || 0 };
  logger.info(`[${requestId}] [publish-threat-ioc] Done:`, JSON.stringify(result));
  return result;
});
