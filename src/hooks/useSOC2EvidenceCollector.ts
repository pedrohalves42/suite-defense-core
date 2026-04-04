/**
 * Hook for SOC 2 Evidence Collection automation
 * Calls the soc2-evidence-collector edge function
 */

import { useState, useCallback } from 'react';
import { callEdgeFunction } from '@/lib/edge-function-client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';

export interface EvidenceItem {
  control_id: string;
  evidence_type: string;
  reference: string;
  description: string;
  metadata: Record<string, unknown>;
}

export interface ControlSummary {
  count: number;
  strength: 'none' | 'weak' | 'moderate' | 'strong';
  descriptions: string[];
}

export interface EvidenceCollectionResult {
  success: boolean;
  timestamp: string;
  tenant_id: string;
  controls: string[];
  evidence: EvidenceItem[];
  summary: Record<string, ControlSummary>;
  saved: boolean;
}

export function useSOC2EvidenceCollector() {
  const { tenant } = useTenant();
  const [isCollecting, setIsCollecting] = useState(false);
  const [result, setResult] = useState<EvidenceCollectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const collectEvidence = useCallback(async (save = false): Promise<EvidenceCollectionResult | null> => {
    if (!tenant?.id) {
      toast.error('Tenant não identificado');
      return null;
    }

    setIsCollecting(true);
    setError(null);

    try {
      const data = await callEdgeFunction<EvidenceCollectionResult>(
        'soc2-evidence-collector',
        { save }
      );

      setResult(data);

      if (data.success) {
        const totalEvidence = data.evidence.length;
        const strongControls = Object.values(data.summary).filter(s => s.strength === 'strong').length;
        toast.success(
          `Coleta concluída: ${totalEvidence} evidências encontradas, ${strongControls} controles fortes`
        );
      }

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao coletar evidências';
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setIsCollecting(false);
    }
  }, [tenant?.id]);

  const getStrengthEmoji = useCallback((strength: ControlSummary['strength']) => {
    switch (strength) {
      case 'strong': return '🟢';
      case 'moderate': return '🟡';
      case 'weak': return '🔴';
      case 'none': return '⚫';
    }
  }, []);

  return {
    collectEvidence,
    isCollecting,
    result,
    error,
    getStrengthEmoji,
  };
}
