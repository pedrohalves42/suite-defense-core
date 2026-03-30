/**
 * Threat intel loading and matching for flush-event-buffer
 * Extraído de flush-event-buffer/index.ts
 */
import { logger } from '../_shared/logger.ts';

export interface ThreatIndicator {
  indicator_value: string;
  indicator_type: string;
  severity: string;
  source: string;
  confidence_score: number;
}

export interface ThreatIntelCache {
  ips: Map<string, ThreatIndicator>;
  hashes: Map<string, ThreatIndicator>;
  domains: Map<string, ThreatIndicator>;
}

export async function loadThreatIntel(supabase: any): Promise<ThreatIntelCache> {
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
          case 'domain': case 'url': domains.set(val, ti); break;
        }
      }
    }
  } catch (e) {
    logger.warn('[flush-event-buffer] Failed to load threat intel (non-blocking):', e);
  }

  return { ips, hashes, domains };
}

export interface BaselineData {
  mean_value: number;
  std_deviation: number;
  threshold_multiplier: number;
}

export async function loadBaselines(supabase: any): Promise<Map<string, BaselineData>> {
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
          baselines.set(`${b.agent_id}:${b.baseline_type}`, {
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

export function isAnomaly(value: number, baseline: BaselineData): boolean {
  const threshold = baseline.mean_value + (baseline.std_deviation * baseline.threshold_multiplier);
  return value > threshold;
}
