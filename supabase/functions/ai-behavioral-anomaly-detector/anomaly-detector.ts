/**
 * Statistical anomaly detection engine for agent behavioral baselines.
 */

export interface DetectedAnomaly {
  agent: string;
  metric: string;
  current: number;
  mean: number;
  std: number;
  multiplier: number;
  deviation: number;
}

interface BaselineRow {
  agent_id: string;
  baseline_type: string;
  mean_value: number | null;
  std_deviation: number | null;
  threshold_multiplier: number | null;
}

interface MetricRow {
  agent_id: string;
  cpu_usage_percent?: number;
  memory_usage_percent?: number;
  disk_usage_percent?: number;
}

export function detectStatisticalAnomalies(
  baselines: BaselineRow[],
  metricsByAgent: Map<string, MetricRow[]>,
  agentMap: Map<string, string>,
): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];

  for (const baseline of baselines) {
    const agentMetrics = metricsByAgent.get(baseline.agent_id);
    if (!agentMetrics || agentMetrics.length === 0) continue;
    if (baseline.mean_value == null || baseline.std_deviation == null) continue;

    const multiplier = baseline.threshold_multiplier || 2;
    const threshold = baseline.mean_value + (multiplier * baseline.std_deviation);

    let currentValues: number[] = [];
    switch (baseline.baseline_type) {
      case 'cpu_usage':
        currentValues = agentMetrics.map(m => m.cpu_usage_percent).filter((v): v is number => v != null);
        break;
      case 'memory_usage':
        currentValues = agentMetrics.map(m => m.memory_usage_percent).filter((v): v is number => v != null);
        break;
      case 'disk_usage':
        currentValues = agentMetrics.map(m => m.disk_usage_percent).filter((v): v is number => v != null);
        break;
    }

    if (currentValues.length === 0) continue;
    const currentAvg = currentValues.reduce((a, b) => a + b, 0) / currentValues.length;

    if (currentAvg > threshold) {
      const deviation = baseline.std_deviation > 0
        ? ((currentAvg - baseline.mean_value) / baseline.std_deviation) * 100
        : 100;

      anomalies.push({
        agent: agentMap.get(baseline.agent_id) || baseline.agent_id,
        metric: baseline.baseline_type,
        current: Math.round(currentAvg * 10) / 10,
        mean: Math.round(baseline.mean_value * 10) / 10,
        std: Math.round(baseline.std_deviation * 10) / 10,
        multiplier,
        deviation: Math.round(deviation),
      });
    }
  }

  return anomalies;
}

/**
 * Group metrics by agent_id.
 */
export function groupMetricsByAgent(metrics: MetricRow[]): Map<string, MetricRow[]> {
  const map = new Map<string, MetricRow[]>();
  for (const m of metrics) {
    if (!map.has(m.agent_id)) map.set(m.agent_id, []);
    map.get(m.agent_id)!.push(m);
  }
  return map;
}
