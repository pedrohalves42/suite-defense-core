/**
 * Event categorization and enrichment for flush-event-buffer
 * Extraído de flush-event-buffer/index.ts
 */
import type { ThreatIntelCache, BaselineData } from './threat-intel.ts';
import { isAnomaly } from './threat-intel.ts';

export interface ProcessedEvents {
  processEvents: Array<Record<string, unknown>>;
  fileEvents: Array<Record<string, unknown>>;
  networkEvents: Array<Record<string, unknown>>;
  registryEvents: Array<Record<string, unknown>>;
  processedIds: string[];
  threatMatches: Array<Record<string, unknown>>;
  anomalyAlerts: Array<Record<string, unknown>>;
}

/**
 * Categorize, enrich events with threat intel, and detect behavioral anomalies.
 */
export function processAndEnrichEvents(
  rows: Array<Record<string, any>>,
  threatIntel: ThreatIntelCache,
  baselines: Map<string, BaselineData>,
): ProcessedEvents {
  const processEvents: Array<Record<string, unknown>> = [];
  const fileEvents: Array<Record<string, unknown>> = [];
  const networkEvents: Array<Record<string, unknown>> = [];
  const registryEvents: Array<Record<string, unknown>> = [];
  const processedIds: string[] = [];
  const threatMatches: Array<Record<string, unknown>> = [];
  const anomalyAlerts: Array<Record<string, unknown>> = [];

  const agentNetworkCounts = new Map<string, number>();
  const agentProcessCounts = new Map<string, number>();

  for (const row of rows) {
    processedIds.push(row.id);
    const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;

    switch (row.event_category) {
      case 'process':
        processEvents.push(payload);
        agentProcessCounts.set(row.agent_id, (agentProcessCounts.get(row.agent_id) || 0) + 1);
        if (payload.sha256_hash) {
          const match = threatIntel.hashes.get(payload.sha256_hash.toLowerCase());
          if (match) {
            payload.is_suspicious = true;
            payload.detection_tags = [...(payload.detection_tags || []), 'threat_intel_hash'];
            threatMatches.push({ tenant_id: row.tenant_id, agent_id: row.agent_id, indicator_type: 'hash_sha256', indicator_value: payload.sha256_hash, matched_source: match.source, matched_severity: match.severity, context: { process_name: payload.process_name, event_category: 'process' } });
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
            threatMatches.push({ tenant_id: row.tenant_id, agent_id: row.agent_id, indicator_type: 'hash_sha256', indicator_value: payload.sha256_hash, matched_source: match.source, matched_severity: match.severity, context: { file_path: payload.file_path, event_category: 'file' } });
          }
        }
        break;

      case 'network':
        networkEvents.push(payload);
        agentNetworkCounts.set(row.agent_id, (agentNetworkCounts.get(row.agent_id) || 0) + 1);
        if (payload.remote_address) {
          const ipMatch = threatIntel.ips.get(payload.remote_address.toLowerCase());
          if (ipMatch) {
            payload.is_suspicious = true;
            payload.detection_tags = [...(payload.detection_tags || []), 'threat_intel_ip'];
            threatMatches.push({ tenant_id: row.tenant_id, agent_id: row.agent_id, indicator_type: 'ip', indicator_value: payload.remote_address, matched_source: ipMatch.source, matched_severity: ipMatch.severity, context: { process_name: payload.process_name, remote_port: payload.remote_port, event_category: 'network' } });
          }
        }
        if (payload.domain) {
          const domainMatch = threatIntel.domains.get(payload.domain.toLowerCase());
          if (domainMatch) {
            payload.is_suspicious = true;
            payload.detection_tags = [...(payload.detection_tags || []), 'threat_intel_domain'];
            threatMatches.push({ tenant_id: row.tenant_id, agent_id: row.agent_id, indicator_type: 'domain', indicator_value: payload.domain, matched_source: domainMatch.source, matched_severity: domainMatch.severity, context: { process_name: payload.process_name, event_category: 'network' } });
          }
        }
        break;

      case 'registry':
        registryEvents.push({
          tenant_id: row.tenant_id, agent_id: row.agent_id,
          event_type: (payload.event_type === 'registry_snapshot') ? 'registry_value_set' : payload.event_type,
          key_path: payload.key_path, value_name: payload.value_name,
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
    }
  }

  // Behavioral anomaly detection
  for (const [agentId, count] of agentNetworkCounts) {
    const baseline = baselines.get(`${agentId}:network_connections`);
    if (baseline && isAnomaly(count, baseline)) {
      const agentRow = rows.find(r => r.agent_id === agentId);
      if (agentRow) {
        anomalyAlerts.push({
          tenant_id: agentRow.tenant_id, agent_id: agentId, alert_type: 'behavioral_anomaly', severity: 'high',
          title: '[Auto] Anomalia comportamental: Conexoes de rede',
          message: `Agente com ${count} conexoes de rede neste ciclo (baseline: ${baseline.mean_value.toFixed(0)} ± ${baseline.std_deviation.toFixed(0)})`,
          details: { baseline_mean: baseline.mean_value, baseline_std: baseline.std_deviation, current_value: count, threshold: baseline.mean_value + baseline.std_deviation * baseline.threshold_multiplier, source: 'flush-event-buffer' },
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
          tenant_id: agentRow.tenant_id, agent_id: agentId, alert_type: 'behavioral_anomaly', severity: 'medium',
          title: '[Auto] Anomalia comportamental: Eventos de processo',
          message: `Agente com ${count} eventos de processo neste ciclo (baseline: ${baseline.mean_value.toFixed(0)} ± ${baseline.std_deviation.toFixed(0)})`,
          details: { baseline_mean: baseline.mean_value, baseline_std: baseline.std_deviation, current_value: count, source: 'flush-event-buffer' },
        });
      }
    }
  }

  return { processEvents, fileEvents, networkEvents, registryEvents, processedIds, threatMatches, anomalyAlerts };
}
