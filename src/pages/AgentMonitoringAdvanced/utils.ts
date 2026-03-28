import type { AgentMetrics } from './types';

export function getAgentCardStyle(agent: AgentMetrics) {
  if (!agent.is_online) {
    return {
      border: 'border-dashed border-muted-foreground/50',
      bg: 'bg-muted/20',
      label: 'Offline'
    };
  }
  const hasCritical = (agent.cpu_usage ?? 0) > 90 || (agent.disk_usage ?? 0) > 90;
  const hasMedium = (agent.cpu_usage ?? 0) > 70 || (agent.memory_usage ?? 0) > 85 || (agent.disk_usage ?? 0) > 80;
  
  if (hasCritical) {
    return {
      border: 'border-red-500/50 border-l-4 border-l-red-500',
      bg: 'bg-red-500/5',
      label: 'Crítico'
    };
  }
  if (hasMedium) {
    return {
      border: 'border-amber-500/50 border-l-4 border-l-amber-500',
      bg: 'bg-amber-500/5',
      label: 'Atenção'
    };
  }
  return {
    border: 'border-border',
    bg: '',
    label: 'Normal'
  };
}

export function getHealthColor(value: number | null, threshold: number) {
  if (value === null) return 'text-muted-foreground';
  if (value > threshold) return 'text-destructive';
  if (value > threshold * 0.8) return 'text-warning';
  return 'text-success';
}

export function getHealthBg(value: number | null, threshold: number) {
  if (value === null) return 'bg-muted';
  if (value > threshold) return 'bg-destructive/10';
  if (value > threshold * 0.8) return 'bg-warning/10';
  return 'bg-success/10';
}
