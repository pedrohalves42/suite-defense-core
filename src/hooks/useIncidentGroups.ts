import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';

export interface IncidentGroup {
  id: string;
  fingerprint_hash: string;
  source_type: 'job' | 'dlq' | 'alert';
  failure_class: string;
  normalized_signature: {
    source_type?: string;
    job_type?: string;
    error_code?: string;
    failure_class?: string;
    agent_version_major?: string;
  };
  severity_hint: 'critical' | 'high' | 'medium' | 'low';
  total_occurrences: number;
  distinct_tenants: number;
  distinct_agents: number;
  first_seen_at: string;
  last_seen_at: string;
  is_active: boolean;
  is_trending: boolean;
  is_ongoing: boolean;
  occurrences_24h: number;
}

export interface IncidentStatus {
  label: string;
  color: 'red' | 'orange' | 'amber' | 'green';
  icon: 'flame' | 'activity' | 'trending-up' | 'check';
}

export const useIncidentGroups = (limit = 50) => {
  const { activeTenant, loading } = useActiveTenant(); // ADR-030 CRIT-01

  return useQuery({
    queryKey: ['incident-groups', activeTenant?.id, limit],
    queryFn: async (): Promise<IncidentGroup[]> => {
      if (!activeTenant?.id) return [];
      
      // Note: v_incident_groups aggregates cross-tenant data for super admins
      // RLS on base tables (failure_fingerprints, failure_occurrences) provides isolation
      // V-1038 FIX: Add tenant_id filter to view
      const { data, error } = await supabase
        .from('v_incident_groups')
        .select('id, fingerprint_hash, source_type, failure_class, normalized_signature, severity_hint, total_occurrences, distinct_agents, first_seen_at, last_seen_at, is_active, is_ongoing, tenant_id')
        .eq('tenant_id', activeTenant.id)
        .limit(limit);

      if (error) throw error;
      return (data || []) as unknown as IncidentGroup[];
    },
    enabled: !loading && !!activeTenant?.id, // ADR-030 CRIT-01
    refetchInterval: 300000, // COST-OPT: 60s → 5min
    staleTime: 30000,
  });
};

// Helper para obter label amigavel do incidente
export const getIncidentLabel = (group: IncidentGroup): string => {
  const sig = group.normalized_signature;
  const errorCode = sig.error_code || group.failure_class;
  const jobType = sig.job_type;
  
  // Map error codes to Portuguese
  const errorLabels: Record<string, string> = {
    'NETWORK_TIMEOUT': 'Timeout de Rede',
    'AUTH_ERROR': 'Erro de Autenticação',
    'NULL_REFERENCE': 'Referência Nula',
    'MEMORY_ERROR': 'Erro de Memória',
    'DISK_ERROR': 'Erro de Disco',
    'CONNECTION_REFUSED': 'Conexão Recusada',
    'DNS_ERROR': 'Erro de DNS',
    'SSL_ERROR': 'Erro de SSL',
    'NO_MESSAGE': 'Sem Mensagem',
    'UNKNOWN': 'Desconhecido',
    'BUG': 'Bug',
    'CASCADE_FAILURE': 'Falha em Cascata',
    'AGENT_STALLED': 'Agente Travado',
    'AGENT_INCOMPATIBLE': 'Agente Incompatível',
    'AGENT_OFFLINE': 'Agente Offline',
    'POLICY': 'Violação de Policy',
    'TIMEOUT': 'Timeout',
  };

  const errorLabel = errorLabels[errorCode] || errorCode;
  
  if (jobType) {
    // Format job type nicely
    const formattedJobType = jobType
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
    return `${errorLabel} em ${formattedJobType}`;
  }
  
  return errorLabel;
};

// Helper para status do incidente
export const getIncidentStatus = (group: IncidentGroup): IncidentStatus => {
  if (group.is_ongoing && group.occurrences_24h > 10) {
    return { label: 'Ongoing', color: 'red', icon: 'flame' };
  }
  if (group.is_ongoing) {
    return { label: 'Ativo', color: 'orange', icon: 'activity' };
  }
  if (group.is_trending) {
    return { label: 'Tendência', color: 'amber', icon: 'trending-up' };
  }
  return { label: 'Estabilizado', color: 'green', icon: 'check' };
};

// Helper para cor do severity
export const getSeverityColor = (severity: IncidentGroup['severity_hint']) => {
  switch (severity) {
    case 'critical':
      return {
        text: 'text-red-600 dark:text-red-400',
        bg: 'bg-red-500/10',
        border: 'border-red-500',
      };
    case 'high':
      return {
        text: 'text-orange-600 dark:text-orange-400',
        bg: 'bg-orange-500/10',
        border: 'border-orange-500',
      };
    case 'medium':
      return {
        text: 'text-amber-600 dark:text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500',
      };
    default:
      return {
        text: 'text-blue-600 dark:text-blue-400',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500',
      };
  }
};

// Helper para label do severity
export const getSeverityLabel = (severity: IncidentGroup['severity_hint']) => {
  const labels: Record<string, string> = {
    critical: 'Crítico',
    high: 'Alto',
    medium: 'Médio',
    low: 'Baixo',
  };
  return labels[severity] || severity;
};
