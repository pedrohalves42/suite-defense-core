/**
 * publish-threat-ioc Edge Function
 * 
 * CyberShield Threat Network (P0): When an agent detects malware/ransomware,
 * this function publishes the IoCs to the collective threat network.
 * All tenants then receive these IoCs for preventive blocking.
 * 
 * Flow:
 * 1. Agent detects threat (ransomware indicators, malware hash, C2 domain)
 * 2. submit-job-result calls this function with IoC data
 * 3. This function upserts into threat_network_reputation (cross-tenant)
 * 4. This function publishes to threat_indicators for ALL tenants (source: cybershield_network)
 * 5. Agents pick up new IoCs on next poll-jobs cycle
 * 
 * Security: Service-role only (called internally by submit-job-result)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders, buildCorsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';

interface ThreatIoC {
  type: 'file_hash_sha256' | 'file_hash_md5' | 'domain' | 'ip_address' | 'url';
  value: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  tags: string[];
  context: string; // e.g., "ransomware_indicator", "malware_detection"
  source_agent_id?: string;
  source_tenant_id?: string;
  metadata?: Record<string, unknown>;
}

interface PublishRequest {
  iocs: ThreatIoC[];
  detection_type: string; // e.g., "ransomware", "malware", "c2_communication"
  source_agent_name?: string;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  const requestId = crypto.randomUUID().slice(0, 8);

  try {
    // Validate internal secret
    const internalSecret = req.headers.get('X-Internal-Secret');
    const expectedSecret = Deno.env.get('INTERNAL_SECRET');
    
    if (!expectedSecret || internalSecret !== expectedSecret) {
      logger.warn(`[${requestId}] [publish-threat-ioc] Unauthorized access attempt`);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body: PublishRequest = await req.json();
    
    if (!body.iocs || !Array.isArray(body.iocs) || body.iocs.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No IoCs provided' }),
        { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    // Cap at 100 IoCs per request
    const iocs = body.iocs.slice(0, 100);
    logger.info(`[${requestId}] [publish-threat-ioc] Publishing ${iocs.length} IoCs from ${body.detection_type}`);

    let reputationUpserted = 0;
    let indicatorsPublished = 0;

    // Step 1: Update global reputation table (cross-tenant)
    for (const ioc of iocs) {
      // Validate IoC value
      if (!ioc.value || ioc.value.length < 3 || ioc.value.length > 2048) continue;

      const { error: repError } = await supabase
        .from('threat_network_reputation')
        .upsert({
          indicator_type: ioc.type,
          indicator_value: ioc.value.toLowerCase().trim(),
          severity: ioc.severity,
          confidence_score: Math.min(100, 50 + (ioc.severity === 'critical' ? 30 : ioc.severity === 'high' ? 20 : 10)),
          last_reported_at: new Date().toISOString(),
          source_context: {
            detection_type: body.detection_type,
            tags: ioc.tags,
            last_source_agent: body.source_agent_name || 'unknown',
            ...(ioc.metadata || {}),
          },
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'indicator_type,indicator_value',
        });

      if (repError) {
        logger.error(`[${requestId}] Error upserting reputation:`, repError.message);
      } else {
        reputationUpserted++;
      }

      // Increment reporting_tenants_count if this is a new tenant reporting
      if (ioc.source_tenant_id) {
        await supabase.rpc('increment_threat_reputation_count', {
          p_indicator_type: ioc.type,
          p_indicator_value: ioc.value.toLowerCase().trim(),
          p_tenant_id: ioc.source_tenant_id,
        }).catch(() => {
          // RPC may not exist yet, that's ok
        });
      }
    }

    // Step 2: Publish IoCs to ALL active tenants via threat_indicators
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id')
      .eq('is_active', true);

    if (tenantsError) {
      logger.error(`[${requestId}] Error fetching tenants:`, tenantsError.message);
    } else if (tenants && tenants.length > 0) {
      // Build batch insert for all tenants
      const indicatorRows: Array<Record<string, unknown>> = [];

      for (const tenant of tenants) {
        for (const ioc of iocs) {
          if (!ioc.value || ioc.value.length < 3) continue;
          
          indicatorRows.push({
            tenant_id: tenant.id,
            indicator_type: ioc.type,
            indicator_value: ioc.value.toLowerCase().trim(),
            severity: ioc.severity,
            source: 'cybershield_network',
            source_reference: `csn:${body.detection_type}:${requestId}`,
            tags: [...(ioc.tags || []), 'cybershield_network', body.detection_type],
            confidence_score: Math.min(100, 50 + (ioc.severity === 'critical' ? 30 : 20)),
            last_seen_at: new Date().toISOString(),
            is_active: true,
            metadata: {
              network_source: true,
              detection_type: body.detection_type,
              source_agent: body.source_agent_name,
              ...(ioc.metadata || {}),
            },
          });
        }
      }

      // Batch upsert in chunks of 200
      const batchSize = 200;
      for (let i = 0; i < indicatorRows.length; i += batchSize) {
        const batch = indicatorRows.slice(i, i + batchSize);
        const { error: upsertError } = await supabase
          .from('threat_indicators')
          .upsert(batch, {
            onConflict: 'tenant_id,indicator_type,indicator_value,source',
            ignoreDuplicates: false,
          });

        if (upsertError) {
          logger.error(`[${requestId}] Error publishing indicators batch:`, upsertError.message);
        } else {
          indicatorsPublished += batch.length;
        }
      }
    }

    const result = {
      success: true,
      request_id: requestId,
      iocs_received: iocs.length,
      reputation_upserted: reputationUpserted,
      indicators_published: indicatorsPublished,
      tenants_notified: tenants?.length || 0,
    };

    logger.info(`[${requestId}] [publish-threat-ioc] Done:`, JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[${requestId}] [publish-threat-ioc] Fatal:`, errorMsg);
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }
});
