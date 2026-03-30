/**
 * Trend analysis engine for agent metrics.
 */

export interface AgentTrend {
  agent_id: string;
  name: string;
  status: string;
  cpu_trend: string;
  mem_trend: string;
  disk_trend: string;
  avg_cpu: number;
  avg_mem: number;
  avg_disk: number;
  max_cpu: number;
  max_mem: number;
  max_disk: number;
  samples: number;
}

function calcTrend(values: number[]): string {
  if (values.length < 4) return 'stable';
  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);
  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  const change = ((avgSecond - avgFirst) / (avgFirst || 1)) * 100;
  if (change > 15) return 'rising';
  if (change < -15) return 'falling';
  return 'stable';
}

function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

/**
 * Build trend analysis per agent from raw metrics.
 */
export function buildAgentTrends(metrics: any[], agentMap: Map<string, any>): AgentTrend[] {
  const agentMetrics = new Map<string, typeof metrics>();
  for (const m of metrics) {
    if (!agentMetrics.has(m.agent_id)) agentMetrics.set(m.agent_id, []);
    agentMetrics.get(m.agent_id)!.push(m);
  }

  const trends: AgentTrend[] = [];
  for (const [agentId, agentData] of agentMetrics.entries()) {
    if (agentData.length < 5) continue;
    const agent = agentMap.get(agentId);
    const name = agent?.display_name || agent?.hostname || agent?.agent_name || agentId.slice(0, 8);

    const cpuValues = agentData.map(m => m.cpu_usage_percent).filter(v => v != null) as number[];
    const memValues = agentData.map(m => m.memory_usage_percent).filter(v => v != null) as number[];
    const diskValues = agentData.map(m => m.disk_usage_percent).filter(v => v != null) as number[];

    trends.push({
      agent_id: agentId,
      name,
      status: agent?.status || 'unknown',
      cpu_trend: calcTrend(cpuValues),
      mem_trend: calcTrend(memValues),
      disk_trend: calcTrend(diskValues),
      avg_cpu: Math.round(avg(cpuValues) * 10) / 10,
      avg_mem: Math.round(avg(memValues) * 10) / 10,
      avg_disk: Math.round(avg(diskValues) * 10) / 10,
      max_cpu: cpuValues.length > 0 ? Math.max(...cpuValues) : 0,
      max_mem: memValues.length > 0 ? Math.max(...memValues) : 0,
      max_disk: diskValues.length > 0 ? Math.max(...diskValues) : 0,
      samples: agentData.length,
    });
  }

  return trends;
}

/**
 * Filter agents that show signs of upcoming failure.
 */
export function filterRiskyAgents(trends: AgentTrend[]): AgentTrend[] {
  return trends.filter(a =>
    a.cpu_trend === 'rising' || a.mem_trend === 'rising' || a.disk_trend === 'rising' ||
    a.max_cpu > 85 || a.max_mem > 85 || a.max_disk > 90
  );
}
