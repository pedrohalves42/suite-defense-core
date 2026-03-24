import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from './useTenant';

export interface BackupStatusRecord {
  id: string;
  agent_id: string;
  tenant_id: string;
  backup_type: string;
  backup_tool: string | null;
  status: string;
  is_enabled: boolean;
  is_scheduled: boolean;
  last_backup_at: string | null;
  next_scheduled_at: string | null;
  last_check_at: string | null;
  backup_target: string | null;
  backup_size_gb: number | null;
  backup_age_hours: number | null;
  error_message: string | null;
  details: Record<string, unknown>;
  collected_at: string;
}

export interface BackupSummary {
  total: number;
  ok: number;
  warning: number;
  critical: number;
  notConfigured: number;
  oldestBackupHours: number | null;
  records: BackupStatusRecord[];
}

export function useBackupStatus() {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['backup-status', tenant?.id],
    queryFn: async (): Promise<BackupSummary> => {
      const { data, error } = await supabase
        .from('backup_status')
        .select('id, agent_id, tenant_id, backup_type, backup_tool, status, is_enabled, is_scheduled, last_backup_at, next_scheduled_at, backup_age_hours, error_message, collected_at')
        .eq('tenant_id', tenant!.id)
        .order('status', { ascending: true });

      if (error) throw error;

      const records = (data || []) as unknown as BackupStatusRecord[];

      const ok = records.filter(r => r.status === 'ok').length;
      const warning = records.filter(r => r.status === 'warning').length;
      const critical = records.filter(r => r.status === 'critical').length;
      const notConfigured = records.filter(r => r.status === 'not_configured').length;

      const ages = records
        .map(r => r.backup_age_hours)
        .filter((a): a is number => a !== null);

      return {
        total: records.length,
        ok,
        warning,
        critical,
        notConfigured,
        oldestBackupHours: ages.length > 0 ? Math.max(...ages) : null,
        records,
      };
    },
    enabled: !!tenant?.id,
    refetchInterval: 300_000, // COST-OPT v8: 60s → 5min (backup status is slow-changing)
    staleTime: 120_000,
    refetchIntervalInBackground: false,
  });
}
