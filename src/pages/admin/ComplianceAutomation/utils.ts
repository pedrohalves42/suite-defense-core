import type { EvidenceCollectionResult } from '@/hooks/useSOC2EvidenceCollector';
import type { FrameworkControl } from './types';

export function deriveStatusFromEvidence(
  controlId: string,
  evidenceResult: EvidenceCollectionResult | null,
): { status: FrameworkControl['status']; evidenceCount: number; notes: string } {
  if (!evidenceResult?.summary) {
    return { status: 'not_applicable', evidenceCount: 0, notes: '' };
  }

  const summary = evidenceResult.summary[controlId];
  if (!summary || summary.count === 0) {
    return { status: 'non_compliant', evidenceCount: 0, notes: 'Sem evidências coletadas.' };
  }

  const status: FrameworkControl['status'] =
    summary.strength === 'strong' ? 'compliant' :
    summary.strength === 'moderate' ? 'partial' :
    summary.strength === 'weak' ? 'partial' : 'non_compliant';

  return {
    status,
    evidenceCount: summary.count,
    notes: summary.descriptions.join('\n'),
  };
}
