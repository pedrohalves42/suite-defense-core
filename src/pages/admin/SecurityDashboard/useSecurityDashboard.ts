import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSuperAdmin } from '@/hooks/useSuperAdmin';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';

export interface SecurityLog {
  id: string;
  created_at: string;
  ip_address: string;
  endpoint: string;
  attack_type: string;
  severity: string;
  blocked: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details: any;
  user_agent: string;
}

export interface BlockedIP {
  id: string;
  ip_address: string;
  blocked_until: string;
  reason: string;
  created_at: string;
}

export interface FailedAttempt {
  id: string;
  ip_address: string;
  email: string | null;
  created_at: string;
  user_agent: string;
}

export interface SecurityStats {
  total: number;
  critical: number;
  blocked: number;
  uniqueIps: number;
}

const STALE_TIME = 600_000;

export function useSecurityDashboard() {
  const queryClient = useQueryClient();
  const { isSuperAdmin } = useSuperAdmin();
  const { tenant } = useTenant();

  const { data: logs, isLoading } = useQuery({
    queryKey: ['security-logs', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from('security_logs')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as SecurityLog[];
    },
    enabled: !!tenant?.id,
    refetchInterval: false,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
  });

  const { data: stats } = useQuery({
    queryKey: ['security-stats', tenant?.id],
    queryFn: async (): Promise<SecurityStats> => {
      if (!tenant?.id) return { total: 0, critical: 0, blocked: 0, uniqueIps: 0 };
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [totalResult, criticalResult, blockedResult, uniqueIpsResult] = await Promise.all([
        supabase.from('security_logs').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).gte('created_at', last24h),
        supabase.from('security_logs').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('severity', 'critical').gte('created_at', last24h),
        supabase.from('security_logs').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('blocked', true).gte('created_at', last24h),
        supabase.from('security_logs').select('ip_address').eq('tenant_id', tenant.id).gte('created_at', last24h),
      ]);

      const uniqueIps = new Set((uniqueIpsResult.data || []).map(l => l.ip_address)).size;

      return {
        total: totalResult.count || 0,
        critical: criticalResult.count || 0,
        blocked: blockedResult.count || 0,
        uniqueIps,
      };
    },
    refetchInterval: false,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
  });

  const { data: blockedIPs } = useQuery({
    queryKey: ['blocked-ips'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ip_blocklist')
        .select('*')
        .gte('blocked_until', new Date().toISOString())
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as BlockedIP[];
    },
    refetchInterval: false,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
    enabled: isSuperAdmin,
  });

  const { data: failedAttempts } = useQuery({
    queryKey: ['failed-attempts'],
    queryFn: async () => {
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('failed_login_attempts')
        .select('*')
        .gte('created_at', last24h)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as FailedAttempt[];
    },
    refetchInterval: false,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
    enabled: isSuperAdmin,
  });

  const unblockIPMutation = useMutation({
    mutationFn: async (ipAddress: string) => {
      const { error } = await supabase
        .from('ip_blocklist')
        .delete()
        .eq('ip_address', ipAddress)
        .eq('tenant_id', tenant!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocked-ips'] });
      toast.success('IP desbloqueado com sucesso');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao desbloquear IP: ${error.message}`);
    },
  });

  return {
    logs, isLoading, stats, blockedIPs, failedAttempts,
    unblockIPMutation, isSuperAdmin,
  };
}

export function getSeverityColor(severity: string) {
  switch (severity) {
    case 'critical': return 'destructive';
    case 'high': return 'destructive';
    case 'medium': return 'default';
    case 'low': return 'secondary';
    default: return 'outline';
  }
}

export function getAttackTypeLabel(type: string) {
  const labels: Record<string, string> = {
    sql_injection: 'Injeção SQL',
    xss: 'Script Malicioso (XSS)',
    path_traversal: 'Acesso a Arquivos',
    rate_limit: 'Excesso de Requisições',
    invalid_input: 'Entrada Inválida',
    brute_force: 'Força Bruta',
    unauthorized: 'Acesso Não Autorizado',
    control_characters: 'Caracteres Suspeitos',
  };
  return labels[type] || type;
}
