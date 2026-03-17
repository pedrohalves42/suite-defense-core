import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from './useTenant';

export interface DataExposureFinding {
  id: string;
  agent_id: string;
  tenant_id: string;
  finding_type: string;
  data_category: string;
  severity: string;
  file_path: string;
  file_name: string | null;
  file_size_bytes: number | null;
  file_owner: string | null;
  match_count: number;
  sample_preview: string | null;
  detection_method: string;
  confidence_score: number;
  status: string;
  remediated_at: string | null;
  detected_at: string;
  created_at: string;
  details: Record<string, unknown>;
}

export interface DataExposureSummary {
  total: number;
  open: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  byCategory: Record<string, number>;
  findings: DataExposureFinding[];
}

export function useDataExposure() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['data-exposure', tenant?.id],
    queryFn: async (): Promise<DataExposureSummary> => {
      // PERF-FIX: Slim select — avoid fetching large details/sample_preview blobs
      const { data, error } = await supabase
        .from('data_exposure_findings')
        .select('id, agent_id, tenant_id, finding_type, data_category, severity, file_path, file_name, file_size_bytes, file_owner, match_count, detection_method, confidence_score, status, remediated_at, detected_at, created_at')
        .eq('tenant_id', tenant!.id)
        .order('detected_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      const findings = (data || []) as unknown as DataExposureFinding[];
      const open = findings.filter(f => f.status === 'open');

      const byCategory: Record<string, number> = {};
      open.forEach(f => {
        byCategory[f.data_category] = (byCategory[f.data_category] || 0) + 1;
      });

      return {
        total: findings.length,
        open: open.length,
        critical: open.filter(f => f.severity === 'critical').length,
        high: open.filter(f => f.severity === 'high').length,
        medium: open.filter(f => f.severity === 'medium').length,
        low: open.filter(f => f.severity === 'low').length,
        byCategory,
        findings,
      };
    },
    enabled: !!tenant?.id,
    refetchInterval: 60_000,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (!tenant?.id) throw new Error('Tenant not found');
      const updates: Record<string, unknown> = { status };
      if (status === 'remediated') {
        updates.remediated_at = new Date().toISOString();
      }
      // V-1047 FIX: Add tenant_id filter
      const { error } = await supabase
        .from('data_exposure_findings')
        .update(updates)
        .eq('id', id)
        .eq('tenant_id', tenant.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-exposure'] });
    },
  });

  return { ...query, updateStatus };
}
