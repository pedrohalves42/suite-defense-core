/**
 * Hook for Evidence Bundle Export
 * Fase 3: Exportação Audit-Ready (Prova Criptográfica)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';

export interface EvidenceBundle {
  id: string;
  tenant_id: string;
  audit_id: string;
  bundle_type: 'incident' | 'compliance' | 'audit' | 'custom';
  period_start: string;
  period_end: string;
  manifest_hash: string;
  included_evidence: {
    securityEvents?: boolean;
    jobs?: boolean;
    signatures?: boolean;
    hashChain?: boolean;
    riskDecisions?: boolean;
    playbookExecutions?: boolean;
    auditLogs?: boolean;
  };
  file_count: number;
  total_size_bytes: number;
  download_url: string | null;
  download_expires_at: string | null;
  verification_url: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ExportOptions {
  periodStart: string;
  periodEnd: string;
  bundleType: EvidenceBundle['bundle_type'];
  agentId?: string;
  includeOptions?: EvidenceBundle['included_evidence'];
}

export function useEvidenceBundles() {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['evidence-bundles', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];

      const { data, error } = await supabase
        .from('evidence_bundles')
        .select('id, tenant_id, audit_id, bundle_type, period_start, period_end, manifest_hash, included_evidence, file_count, total_size_bytes, download_url, download_expires_at, verification_url, created_by, created_at')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as EvidenceBundle[];
    },
    enabled: !!tenant?.id,
  });
}

export function useExportEvidenceBundle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (options: ExportOptions) => {
      const { data, error } = await supabase.functions.invoke('export-evidence-bundle', {
        body: options,
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to export bundle');

      return data as {
        success: boolean;
        auditId: string;
        manifestHash: string;
        verificationUrl: string;
        recordCount: number;
        sizeBytes: number;
        bundle: Record<string, unknown>;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['evidence-bundles'] });
      toast.success(`Bundle exportado! ID: ${data.auditId}`);
    },
    onError: (error) => {
      console.error('Failed to export bundle:', error);
      toast.error('Erro ao exportar bundle de evidências');
    },
  });
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export const BUNDLE_TYPE_LABELS: Record<EvidenceBundle['bundle_type'], string> = {
  incident: 'Incidente',
  compliance: 'Compliance',
  audit: 'Auditoria',
  custom: 'Personalizado',
};

export const BUNDLE_TYPE_DESCRIPTIONS: Record<EvidenceBundle['bundle_type'], string> = {
  incident: 'Evidências relacionadas a um incidente de segurança específico',
  compliance: 'Evidências para demonstrar conformidade com regulações (LGPD, ISO 27001)',
  audit: 'Pacote completo para auditoria externa',
  custom: 'Seleção personalizada de evidências',
};
