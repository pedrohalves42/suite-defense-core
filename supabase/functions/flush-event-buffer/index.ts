/**
 * flush-event-buffer ? Batch processor for the event ingestion buffer.
 * 
 * ARCHITECTURE: Reads unprocessed events from `endpoint_event_buffer`,
 * distributes them to the correct final tables in bulk, then marks
 * rows as processed.
 * 
 * HARDENING (v2): Includes inline Threat Intel matching (IP/hash/domain)
 * and behavioral anomaly detection per agent.
 * 
 * Runs on cron every 10 seconds for near-real-time processing.
 * 
 * Auth: Internal only (assertInternalCaller)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { corsHeaders, buildCorsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';

const BATCH_SIZE = 5000;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ?? Threat Intel Cache (refreshed per invocation) ??
interface ThreatIndicator {
  indicator_value: string;
  indicator_type: string;
  severity: string;
  source: string;
  confidence_score: number;
}

async function loadThreatIntel(supabase: Record<string, unknown>): Promise<{
  ips: Map<string, ThreatIndicator>;
  hashes: Map<string, ThreatIndicator>;
  domains: Map<string, ThreatIndicator>;
}> {
  const ips = new Map<string, ThreatIndicator>();
  const hashes = new Map<string, ThreatIndicator>();
  const domains = new Map<string, ThreatIndicator>();

  try {
    const { data } = await supabase
      .from('threat_indicators')
      .select('indicator_value, indicator_type, severity, source, confidence_score')
      .eq('is_active', true)
      .limit(10000);

    if (data) {
      for (const ti of data) {
        const val = ti.indicator_value.toLowerCase();
        switch (ti.indicator_type) {
          case 'ip': ips.set(val, ti); break;
          case 'hash_sha256': hashes.set(val, ti); break;
          case 'domain': domains.set(val, ti); break;
          case 'url': domains.set(val, ti); break;
        }
      }
    }
  } catch (e) {
    logger.warn('[flush-event-buffer] Failed to load threat intel (non-blocking):', e);
  }

  return { ips, hashes, domains };
}

// ?? Behavioral Anomaly Detection ??
interface BaselineData {
  mean_value: number;
  std_deviation: number;
  threshold_multiplier: number;
}

async function loadBaselines(supabase: Record<string, unknown>): Promise<Map<string, BaselineData>> {
  const baselines = new Map<string, BaselineData>();
  try {
    const { data } = await supabase
      .from('agent_behavioral_baseline')
      .select('agent_id, baseline_type, mean_value, std_deviation, threshold_multiplier')
      .eq('is_active', true)
      .limit(5000);

    if (data) {
      for (const b of data) {
        if (b.mean_value != null && b.std_deviation != null) {
          const key = `${b.agent_id}:${b.baseline_type}`;
          baselines.set(key, {
            mean_value: b.mean_value,
            std_deviation: b.std_deviation,
            threshold_multiplier: b.threshold_multiplier || 2.5,
          });
        }
      }
    }
  } catch (e) {
    logger.warn('[flush-event-buffer] Failed to load baselines (non-blocking):', e);
  }
  return baselines;
}

function isAnomaly(value: number, baseline: BaselineData): boolean {
  const threshold = baseline.mean_value + (baseline.std_deviation * baseline.threshold_multiplier);
  return value > threshold;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: buildCorsHeaders(origin) });
  }

  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const batchId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    // ?? Step 1: Claim batch ??
    const { data: claimedCount, error: claimError } = await supabase.rpc('claim_event_buffer_batch', {
      p_batch_id: batchId,
      p_limit: BATCH_SIZE,
    });

    if (claimError) {
      logger.error('[flush-event-buffer] claim error:', claimError.message);
      return new Response(JSON.stringify({ error: claimError.message }), {
        status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    if (!claimedCount || claimedCount === 0) {
      return new Response(JSON.stringify({ flushed: 0, message: 'Buffer empty' }), {
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    // ?? Step 2: Fetch claimed rows ??
    const { data: rows, error: fetchError } = await supabase
      .from('endpoint_event_buffer')
      .select('id, tenant_id, agent_id, event_category, payload')
      .eq('batch_id', batchId)
      .is('processed_at', null);

    if (fetchError || !rows?.length) {
      return new Response(JSON.stringify({ flushed: 0, message: 'Buffer empty' }), {
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    // ?? Step 2.5: Load Threat Intel & Baselines in parallel ??
    const [threatIntel, baselines] = await Promise.all([
      loadThreatIntel(supabase),
      loadBaselines(supabase),
    ]);

    // ?? Step 3: Group by category & enrich ??
    const processEvents: Array<Record<string, unknown>> = [];
    const fileEvents: Array<Record<string, unknown>> = [];
    const networkEvents: Array<Record<string, unknown>> = [];
    const registryEvents: Array<Record<string, unknown>> = [];
    const processedIds: string[] = [];
    const threatMatches: Array<Record<string, unknown>> = [];
    const anomalyAlerts: Array<Record<string, unknown>> = [];

    // Track per-agent event counts for behavioral anomaly
    const agentNetworkCounts = new Map<string, number>();
    const agentProcessCounts = new Map<string, number>();

    for (const row of rows) {
      processedIds.push(row.id);
      const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;

      switch (row.event_category) {
        case 'process':
          processEvents.push(payload);
          agentProcessCounts.set(row.agent_id, (agentProcessCounts.get(row.agent_id) || 0) + 1);
          // Check hash against threat intel
          if (payload.sha256_hash) {
            const match = threatIntel.hashes.get(payload.sha256_hash.toLowerCase());
            if (match) {
              payload.is_suspicious = true;
              payload.detection_tags = [...(payload.detection_tags || []), 'threat_intel_hash'];
              threatMatches.push({
                tenant_id: row.tenant_id,
                agent_id: row.agent_id,
                indicator_type: 'hash_sha256',
                indicator_value: payload.sha256_hash,
                matched_source: match.source,
                matched_severity: match.severity,
                context: { process_name: payload.process_name, event_category: 'process' },
              });
            }
          }
          break;

        case 'file':
          fileEvents.push(payload);
          if (payload.sha256_hash) {
            const match = threatIntel.hashes.get(payload.sha256_hash.toLowerCase());
            if (match) {
              payload.is_suspicious = true;
              payload.detection_tags = [...(payload.detection_tags || []), 'threat_intel_hash'];
              threatMatches.push({
                tenant_id: row.tenant_id,
                agent_id: row.agent_id,
                indicator_type: 'hash_sha256',
                indicator_value: payload.sha256_hash,
                matched_source: match.source,
                matched_severity: match.severity,
                context: { file_path: payload.file_path, event_category: 'file' },
              });
            }
          }
          break;

        case 'network':
          networkEvents.push(payload);
          agentNetworkCounts.set(row.agent_id, (agentNetworkCounts.get(row.agent_id) || 0) + 1);
          // Check IP against threat intel
          if (payload.remote_address) {
            const ipMatch = threatIntel.ips.get(payload.remote_address.toLowerCase());
            if (ipMatch) {
              payload.is_suspicious = true;
              payload.detection_tags = [...(payload.detection_tags || []), 'threat_intel_ip'];
              threatMatches.push({
                tenant_id: row.tenant_id,
                agent_id: row.agent_id,
                indicator_type: 'ip',
                indicator_value: payload.remote_address,
                matched_source: ipMatch.source,
                matched_severity: ipMatch.severity,
                context: { process_name: payload.process_name, remote_port: payload.remote_port, event_category: 'network' },
              });
            }
          }
          // Check domain against threat intel
          if (payload.domain) {
            const domainMatch = threatIntel.domains.get(payload.domain.toLowerCase());
            if (domainMatch) {
              payload.is_suspicious = true;
              payload.detection_tags = [...(payload.detection_tags || []), 'threat_intel_domain'];
              threatMatches.push({
                tenant_id: row.tenant_id,
                agent_id: row.agent_id,
                indicator_type: 'domain',
                indicator_value: payload.domain,
                matched_source: domainMatch.source,
                matched_severity: domainMatch.severity,
                context: { process_name: payload.process_name, event_category: 'network' },
              });
            }
          }
          break;

        case 'registry':
          registryEvents.push({
            tenant_id: row.tenant_id,
            agent_id: row.agent_id,
            // Normalize registry_snapshot ? registry_value_set for storage
            event_type: (payload.event_type === 'registry_snapshot') ? 'registry_value_set' : payload.event_type,
            key_path: payload.key_path,
            value_name: payload.value_name,
            value_data: payload.value_data != null ? String(payload.value_data) : null,
            value_type: payload.value_type,
            old_value_data: payload.old_value_data != null ? String(payload.old_value_data) : null,
            process_name: payload.process_name,
            process_pid: payload.process_pid ? Number(payload.process_pid) : null,
            is_suspicious: payload.is_suspicious ?? false,
            detection_tags: payload.detection_tags || [],
            mitre_technique_id: payload.mitre_technique_id,
            event_time: payload.event_time,
          });
          break;

        default:
          logger.warn(`[flush-event-buffer] Unknown category: ${row.event_category}`);
      }
    }

    // ?? Step 3.5: Behavioral anomaly checks ??
    for (const [agentId, count] of agentNetworkCounts) {
      const baseline = baselines.get(`${agentId}:network_connections`);
      if (baseline && isAnomaly(count, baseline)) {
        // Find tenant_id for this agent
        const agentRow = rows.find(r => r.agent_id === agentId);
        if (agentRow) {
          anomalyAlerts.push({
            tenant_id: agentRow.tenant_id,
            agent_id: agentId,
            alert_type: 'behavioral_anomaly',
            severity: 'high',
            title: '[Auto] Anomalia comportamental: Conexoes de rede',
            message: `Agente com ${count} conexoes de rede neste ciclo (baseline: ${baseline.mean_value.toFixed(0)} ? ${baseline.std_deviation.toFixed(0)})`,
            details: {
              baseline_mean: baseline.mean_value,
              baseline_std: baseline.std_deviation,
              current_value: count,
              threshold: baseline.mean_value + baseline.std_deviation * baseline.threshold_multiplier,
              source: 'flush-event-buffer',
            },
          });
        }
      }
    }

    for (const [agentId, count] of agentProcessCounts) {
      const baseline = baselines.get(`${agentId}:process_events`);
      if (baseline && isAnomaly(count, baseline)) {
        const agentRow = rows.find(r => r.agent_id === agentId);
        if (agentRow) {
          anomalyAlerts.push({
            tenant_id: agentRow.tenant_id,
            agent_id: agentId,
            alert_type: 'behavioral_anomaly',
            severity: 'medium',
            title: '[Auto] Anomalia comportamental: Eventos de processo',
            message: `Agente com ${count} eventos de processo neste ciclo (baseline: ${baseline.mean_value.toFixed(0)} ? ${baseline.std_deviation.toFixed(0)})`,
            details: {
              baseline_mean: baseline.mean_value,
              baseline_std: baseline.std_deviation,
              current_value: count,
              source: 'flush-event-buffer',
            },
          });
        }
      }
    }

    // ?? Step 4: Batch insert into final tables in parallel ??
    const insertPromises: Promise<{ table: string; count: number; error?: string }>[] = [];

    if (processEvents.length > 0) {
      insertPromises.push(
        supabase.from('endpoint_process_events').insert(processEvents).then(({ error }: any) => ({
          table: 'process', count: error ? 0 : processEvents.length, error: error?.message,
        }))
      );
    }

    if (fileEvents.length > 0) {
      insertPromises.push(
        supabase.from('endpoint_file_events').insert(fileEvents).then(({ error }: any) => ({
          table: 'file', count: error ? 0 : fileEvents.length, error: error?.message,
        }))
      );
    }

    if (networkEvents.length > 0) {
      insertPromises.push(
        supabase.from('endpoint_network_events').insert(networkEvents).then(({ error }: any) => ({
          table: 'network', count: error ? 0 : networkEvents.length, error: error?.message,
        }))
      );
    }

    if (registryEvents.length > 0) {
      insertPromises.push(
        supabase.from('endpoint_registry_events').insert(registryEvents).then(({ error }: any) => ({
          table: 'registry', count: error ? 0 : registryEvents.length, error: error?.message,
        }))
      );
    }

    // Insert threat matches and anomaly alerts in parallel
    if (threatMatches.length > 0) {
      insertPromises.push(
        supabase.from('threat_matches').insert(threatMatches).then(({ error }: any) => ({
          table: 'threat_matches', count: error ? 0 : threatMatches.length, error: error?.message,
        }))
      );
    }

    if (anomalyAlerts.length > 0) {
      insertPromises.push(
        supabase.from('system_alerts').insert(anomalyAlerts).then(({ error }: any) => ({
          table: 'anomaly_alerts', count: error ? 0 : anomalyAlerts.length, error: error?.message,
        }))
      );
    }

    const results = await Promise.all(insertPromises);

    // Log any insert failures
    const failures = results.filter(r => r.error);
    if (failures.length > 0) {
      for (const f of failures) {
        logger.error(`[flush-event-buffer] ${f.table} insert failed:`, f.error);
      }
      const successTables = new Set(results.filter(r => !r.error).map(r => r.table));
      const successIds = rows
        .filter(r => successTables.has(r.event_category))
        .map(r => r.id);

      if (successIds.length > 0) {
        await supabase
          .from('endpoint_event_buffer')
          .update({ processed_at: new Date().toISOString() })
          .in('id', successIds);
      }
    } else {
      // ?? Step 5: Mark ALL rows as processed ??
      const CHUNK = 500;
      const markPromises: Promise<any>[] = [];
      for (let i = 0; i < processedIds.length; i += CHUNK) {
        const chunk = processedIds.slice(i, i + CHUNK);
        markPromises.push(
          supabase
            .from('endpoint_event_buffer')
            .update({ processed_at: new Date().toISOString() })
            .in('id', chunk)
        );
      }
      await Promise.all(markPromises);
    }

    const elapsed = Date.now() - startTime;
    const stats = {
      flushed: processedIds.length,
      process: processEvents.length,
      file: fileEvents.length,
      network: networkEvents.length,
      registry: registryEvents.length,
      threat_matches: threatMatches.length,
      anomaly_alerts: anomalyAlerts.length,
      threat_intel_loaded: threatIntel.ips.size + threatIntel.hashes.size + threatIntel.domains.size,
      baselines_loaded: baselines.size,
      failures: failures.length,
      elapsed_ms: elapsed,
    };

    logger.info(`[flush-event-buffer] Flushed ${stats.flushed} events in ${elapsed}ms (proc=${stats.process} file=${stats.file} net=${stats.network} reg=${stats.registry} threats=${stats.threat_matches} anomalies=${stats.anomaly_alerts})`);

    return new Response(JSON.stringify(stats), {
      headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    logger.error('[flush-event-buffer] Unexpected error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }
});
