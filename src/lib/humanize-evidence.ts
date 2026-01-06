/**
 * Humanize technical evidence data into user-friendly format
 * Transforms raw JSON fields into readable labels and formatted values
 */

import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface HumanizedEvidence {
  label: string;
  value: string;
  originalKey: string;
}

// Maps technical fields to human-readable descriptions
const EVIDENCE_LABELS: Record<string, { 
  label: string; 
  format: (v: unknown) => string;
  priority?: number; // Lower = shows first
}> = {
  // CPU related
  avgCpuUsage: { 
    label: 'Uso médio de CPU',
    format: (v) => `${Math.round(Number(v))}%`,
    priority: 1
  },
  cpu_percent: {
    label: 'CPU atual',
    format: (v) => `${Math.round(Number(v))}%`,
    priority: 1
  },
  maxCpuUsage: {
    label: 'Pico de CPU',
    format: (v) => `${Math.round(Number(v))}%`,
    priority: 2
  },
  
  // Memory related
  memory_percent: {
    label: 'Memória em uso',
    format: (v) => `${Math.round(Number(v))}%`,
    priority: 1
  },
  avgMemoryUsage: {
    label: 'Uso médio de memória',
    format: (v) => `${Math.round(Number(v))}%`,
    priority: 1
  },
  
  // Disk related
  disk_percent: {
    label: 'Disco ocupado',
    format: (v) => `${Math.round(Number(v))}%`,
    priority: 1
  },
  disk_free_gb: {
    label: 'Espaço livre',
    format: (v) => `${Number(v).toFixed(1)} GB`,
    priority: 2
  },
  
  // Failure/Error metrics
  failureRate: {
    label: 'Taxa de falhas',
    format: (v) => Number(v) === 0 ? 'Nenhuma' : `${Number(v).toFixed(1)}%`,
    priority: 2
  },
  failure_count: {
    label: 'Falhas detectadas',
    format: (v) => Number(v) === 0 ? 'Nenhuma' : `${v} ocorrências`,
    priority: 2
  },
  errorCount: {
    label: 'Erros encontrados',
    format: (v) => Number(v) === 0 ? 'Nenhum' : `${v} erros`,
    priority: 2
  },
  
  // Network related
  blocked_requests: {
    label: 'Acessos bloqueados',
    format: (v) => `${v} tentativas`,
    priority: 1
  },
  domain: {
    label: 'Endereço',
    format: (v) => String(v),
    priority: 1
  },
  
  // Time related
  hours_offline: {
    label: 'Tempo offline',
    format: (v) => {
      const hours = Number(v);
      if (hours < 1) return 'Menos de 1 hora';
      if (hours === 1) return '1 hora';
      if (hours < 24) return `${hours} horas`;
      const days = Math.floor(hours / 24);
      return days === 1 ? '1 dia' : `${days} dias`;
    },
    priority: 1
  },
  duration: {
    label: 'Duração',
    format: (v) => String(v),
    priority: 1
  },
  
  // Process related
  process_name: {
    label: 'Programa',
    format: (v) => String(v),
    priority: 1
  },
  processName: {
    label: 'Programa',
    format: (v) => String(v),
    priority: 1
  },
  
  // Dates
  analysisDate: {
    label: 'Analisado em',
    format: (v) => {
      try {
        return format(new Date(String(v)), "dd/MM 'às' HH:mm", { locale: ptBR });
      } catch {
        return String(v);
      }
    },
    priority: 10
  },
  detected_at: {
    label: 'Detectado em',
    format: (v) => {
      try {
        return format(new Date(String(v)), "dd/MM 'às' HH:mm", { locale: ptBR });
      } catch {
        return String(v);
      }
    },
    priority: 10
  },
  
  // Anomaly specific
  anomaly_score: {
    label: 'Nível de anomalia',
    format: (v) => {
      const score = Number(v);
      if (score >= 0.8) return 'Muito alto';
      if (score >= 0.6) return 'Alto';
      if (score >= 0.4) return 'Moderado';
      return 'Baixo';
    },
    priority: 1
  },
  deviation_percent: {
    label: 'Desvio do normal',
    format: (v) => `${Math.round(Number(v))}%`,
    priority: 2
  },
  
  // Count based
  occurrence_count: {
    label: 'Ocorrências',
    format: (v) => `${v} vezes`,
    priority: 2
  },
  affected_files: {
    label: 'Arquivos afetados',
    format: (v) => `${v} arquivos`,
    priority: 2
  },
  
  // Security
  threat_level: {
    label: 'Nível de ameaça',
    format: (v) => {
      const level = String(v).toLowerCase();
      const map: Record<string, string> = {
        critical: 'Crítico',
        high: 'Alto',
        medium: 'Médio',
        low: 'Baixo',
        info: 'Informativo'
      };
      return map[level] || String(v);
    },
    priority: 1
  },
  confidence_score: {
    label: 'Confiança',
    format: (v) => `${Math.round(Number(v) * 100)}%`,
    priority: 3
  },
};

/**
 * Transform raw evidence object into array of humanized items
 */
export function humanizeEvidence(evidence: Record<string, unknown>): HumanizedEvidence[] {
  if (!evidence || typeof evidence !== 'object') {
    return [];
  }

  const items: (HumanizedEvidence & { priority: number })[] = [];
  
  // First, check if there's agent-specific data in evidence_pack
  const evidencePack = evidence.evidence_pack as Array<Record<string, unknown>> | undefined;
  
  // If evidence_pack exists and has agent-specific data, extract it
  if (evidencePack && Array.isArray(evidencePack) && evidencePack.length > 0) {
    // Use the first (or most relevant) agent's data from the pack
    const agentData = evidencePack[0];
    
    // Extract real metrics from evidence_pack
    if (agentData.cpu_usage_percent !== undefined) {
      const cpuValue = Number(agentData.cpu_usage_percent);
      if (!isNaN(cpuValue)) {
        items.push({
          label: 'CPU',
          value: `${cpuValue.toFixed(0)}%`,
          originalKey: 'cpu_usage_percent',
          priority: 1,
        });
      }
    }
    
    if (agentData.memory_usage_percent !== undefined) {
      const memValue = Number(agentData.memory_usage_percent);
      if (!isNaN(memValue)) {
        items.push({
          label: 'Memória',
          value: `${memValue.toFixed(0)}%`,
          originalKey: 'memory_usage_percent',
          priority: 2,
        });
      }
    }
    
    if (agentData.disk_usage_percent !== undefined) {
      const diskValue = Number(agentData.disk_usage_percent);
      if (!isNaN(diskValue)) {
        items.push({
          label: 'Disco',
          value: `${diskValue.toFixed(0)}%`,
          originalKey: 'disk_usage_percent',
          priority: 3,
        });
      }
    }
    
    if (agentData.agent_name) {
      items.push({
        label: 'Agente',
        value: String(agentData.agent_name),
        originalKey: 'agent_name',
        priority: 0,
      });
    }
    
    // If we got data from evidence_pack, return it
    if (items.length > 0) {
      return items
        .sort((a, b) => a.priority - b.priority)
        .slice(0, 6)
        .map(({ label, value, originalKey }) => ({ label, value, originalKey }));
    }
  }

  // Fallback to standard evidence processing
  for (const [key, value] of Object.entries(evidence)) {
    // Skip evidence_pack as we already processed it
    if (key === 'evidence_pack') continue;
    
    const config = EVIDENCE_LABELS[key];
    if (config && value !== null && value !== undefined) {
      items.push({
        label: config.label,
        value: config.format(value),
        originalKey: key,
        priority: config.priority || 5
      });
    }
  }

  // Sort by priority and return without priority field
  return items
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 6) // Max 6 items
    .map(({ label, value, originalKey }) => ({ label, value, originalKey }));
}

/**
 * Get a summary string from evidence (for compact views)
 */
export function getEvidenceSummary(evidence: Record<string, unknown>): string {
  const items = humanizeEvidence(evidence);
  if (items.length === 0) return '';
  
  return items
    .slice(0, 3)
    .map(item => `${item.label}: ${item.value}`)
    .join(' • ');
}
