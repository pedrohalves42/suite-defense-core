import { useState, useCallback } from 'react';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSOC2EvidenceCollector } from '@/hooks/useSOC2EvidenceCollector';
import { useSOC2ControlStatuses, useSaveControlStatus } from '@/hooks/useSOC2ControlStatus';
import { CONTROL_SETS, FRAMEWORKS } from './constants';
import { deriveStatusFromEvidence } from './utils';
import type { FrameworkControl } from './types';

export function useComplianceAutomation() {
  const { tenant } = useTenant();
  const tenantId = tenant?.id;
  const [activeFramework, setActiveFramework] = useState('soc2');

  const { collectEvidence, isCollecting, result: evidenceResult } = useSOC2EvidenceCollector();
  const { data: savedStatuses } = useSOC2ControlStatuses();
  const saveStatus = useSaveControlStatus();

  const { data: metrics, isLoading } = useQuery({
    queryKey: ['compliance-metrics', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const [agentsRes, alertsRes, vulnsRes] = await Promise.all([
        supabase.rpc('get_agents_list', { p_tenant_id: tenantId, p_include_archived: false }),
        supabase.from('system_alerts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active'),
        supabase.from('agent_vulnerability_scans').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('remediation_status', 'pending'),
      ]);
      return {
        agents: ((agentsRes.data as unknown[]) || []).length,
        alerts: alertsRes.count || 0,
        vulns: vulnsRes.count || 0,
      };
    },
    enabled: !!tenantId,
  });

  const buildControls = useCallback((): (FrameworkControl & { notes: string })[] => {
    const controlDefs = CONTROL_SETS[activeFramework] || [];

    return controlDefs.map((ctrl) => {
      if (activeFramework === 'soc2' && evidenceResult) {
        const derived = deriveStatusFromEvidence(ctrl.id, evidenceResult);
        const saved = savedStatuses?.[ctrl.id];
        return {
          id: `${activeFramework}-${ctrl.id}`,
          framework: activeFramework,
          controlId: ctrl.id,
          title: ctrl.title,
          description: ctrl.desc,
          status: saved ? (saved.status as FrameworkControl['status']) : derived.status,
          evidenceCount: derived.evidenceCount,
          lastChecked: evidenceResult?.timestamp ? new Date(evidenceResult.timestamp) : new Date(),
          category: ctrl.category,
          notes: saved?.notes ?? derived.notes,
        };
      }

      let status: FrameworkControl['status'] = 'compliant';
      const m = metrics ?? { agents: 0, alerts: 0, vulns: 0 };

      if (ctrl.category === 'Operações' || ctrl.category === 'Monitoramento' || ctrl.category === 'Detectar') {
        status = m.agents > 0 ? (m.alerts > 5 ? 'partial' : 'compliant') : 'non_compliant';
      } else if (ctrl.id.includes('Vuln') || ctrl.id === 'A.12.6') {
        status = m.vulns > 10 ? 'non_compliant' : m.vulns > 3 ? 'partial' : 'compliant';
      }

      return {
        id: `${activeFramework}-${ctrl.id}`,
        framework: activeFramework,
        controlId: ctrl.id,
        title: ctrl.title,
        description: ctrl.desc,
        status,
        evidenceCount: 0,
        lastChecked: new Date(),
        category: ctrl.category,
        notes: '',
      };
    });
  }, [activeFramework, evidenceResult, savedStatuses, metrics]);

  const controls = buildControls();
  const compliantCount = controls.filter(c => c.status === 'compliant').length;
  const partialCount = controls.filter(c => c.status === 'partial').length;
  const nonCompliantCount = controls.filter(c => c.status === 'non_compliant').length;
  const totalControls = controls.length;
  const complianceScore = totalControls > 0
    ? Math.round(((compliantCount + partialCount * 0.5) / totalControls) * 100)
    : 0;

  const handleAutoFill = async () => {
    const result = await collectEvidence(true);
    if (result?.success) {
      for (const item of result.evidence) {
        const summary = result.summary[item.control_id];
        if (summary) {
          const status =
            summary.strength === 'strong' ? 'implemented' :
            summary.strength === 'moderate' ? 'in_progress' : 'not_started';
          saveStatus.mutate({ controlId: item.control_id, status, notes: summary.descriptions.join('\n'), autoFilled: true });
        }
      }
      toast.success('Controles preenchidos automaticamente com dados reais do sistema');
    }
  };

  const handleSaveControl = (controlId: string, status: string, notes: string) => {
    saveStatus.mutate({ controlId, status, notes });
    toast.success(`Controle ${controlId} salvo`);
  };

  const activeFrameworkData = FRAMEWORKS.find(f => f.id === activeFramework)!;

  return {
    activeFramework,
    setActiveFramework,
    activeFrameworkData,
    controls,
    compliantCount,
    partialCount,
    nonCompliantCount,
    totalControls,
    complianceScore,
    isLoading,
    isCollecting,
    evidenceResult,
    savedStatuses,
    handleAutoFill,
    handleSaveControl,
  };
}
