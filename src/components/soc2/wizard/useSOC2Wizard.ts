import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { useQueryClient } from '@tanstack/react-query';
import { useSOC2EvidenceCollector, type ControlSummary } from '@/hooks/useSOC2EvidenceCollector';
import { SOC2_TRUST_CRITERIA, COMPLIANCE_POLICIES, type CriteriaCode } from '@/types/soc2-compliance';
import { type WizardStep, type WizardResponses } from './types';

function strengthToStatus(strength: ControlSummary['strength']): string {
  switch (strength) {
    case 'strong': return 'implemented';
    case 'moderate': return 'in_progress';
    default: return 'not_started';
  }
}

function getCriteriaSubControls(criteriaCode: CriteriaCode): string[] {
  const criteria = SOC2_TRUST_CRITERIA.find(c => c.code === criteriaCode);
  if (!criteria) return [];
  return criteria.controls.map(c => c.code);
}

export function buildWizardSteps(): WizardStep[] {
  const steps: WizardStep[] = [
    {
      id: 'intro',
      title: 'Bem-vindo ao Assistente SOC 2',
      description: 'Este assistente vai guiá-lo pelo preenchimento de cada critério de conformidade SOC 2 Type I.',
      type: 'review',
    },
  ];

  SOC2_TRUST_CRITERIA.forEach((criteria) => {
    steps.push({
      id: `criteria-${criteria.code}`,
      title: `${criteria.code} — ${criteria.name}`,
      description: criteria.description,
      type: 'criteria',
      criteriaCode: criteria.code,
    });
  });

  COMPLIANCE_POLICIES.forEach((policy) => {
    steps.push({
      id: `policy-${policy.code}`,
      title: policy.name,
      description: policy.description,
      type: 'policy',
      policyDef: policy,
    });
  });

  steps.push({
    id: 'final-review',
    title: 'Revisão Final',
    description: 'Revise todas as respostas antes de salvar.',
    type: 'review',
  });

  return steps;
}

export function useSOC2Wizard() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(0);
  const [responses, setResponses] = useState<WizardResponses>({});
  const [saving, setSaving] = useState(false);
  const [autoFilledSteps, setAutoFilledSteps] = useState<Set<string>>(new Set());
  const { collectEvidence, isCollecting, result: evidenceResult, getStrengthEmoji } = useSOC2EvidenceCollector();

  const steps = buildWizardSteps();
  const step = steps[currentStep];
  const progress = Math.round(((currentStep) / (steps.length - 1)) * 100);

  const updateResponse = (stepId: string, field: string, value: string) => {
    setResponses(prev => ({
      ...prev,
      [stepId]: { ...prev[stepId], [field]: value },
    }));
  };

  const isStepComplete = (stepId: string) => {
    const r = responses[stepId];
    if (!r) return false;
    return Object.values(r).some(v => v.trim().length > 0);
  };

  const completedSteps = steps.filter(s => isStepComplete(s.id)).length;

  const getCriteriaStrength = useCallback((criteriaCode: CriteriaCode): ControlSummary | null => {
    if (!evidenceResult?.summary) return null;
    const subControls = getCriteriaSubControls(criteriaCode);
    const summaries = subControls.map(sc => evidenceResult.summary[sc]).filter(Boolean);
    if (summaries.length === 0) return null;

    const totalCount = summaries.reduce((s, x) => s + x.count, 0);
    const allDescriptions = summaries.flatMap(x => x.descriptions);
    const avgStrength = totalCount === 0 ? 'none' as const
      : totalCount <= summaries.length ? 'weak' as const
      : totalCount <= summaries.length * 3 ? 'moderate' as const
      : 'strong' as const;

    return { count: totalCount, strength: avgStrength, descriptions: allDescriptions };
  }, [evidenceResult]);

  const handleAutoFillAll = useCallback(async () => {
    const data = await collectEvidence(true);
    if (!data?.success) return;

    const newResponses = { ...responses };
    const newAutoFilled = new Set(autoFilledSteps);

    for (const criteria of SOC2_TRUST_CRITERIA) {
      const stepId = `criteria-${criteria.code}`;
      const subControls = getCriteriaSubControls(criteria.code);
      const summaries = subControls.map(sc => data.summary[sc]).filter(Boolean);
      if (summaries.length === 0) continue;

      const descriptions = summaries.flatMap(s => s.descriptions);
      const totalCount = summaries.reduce((s, x) => s + x.count, 0);
      const avgStrength = totalCount === 0 ? 'none' as const
        : totalCount <= summaries.length ? 'weak' as const
        : totalCount <= summaries.length * 3 ? 'moderate' as const
        : 'strong' as const;

      const notesText = descriptions.length > 0
        ? `[Auto-preenchido em ${new Date().toLocaleString('pt-BR')}]\n\n${descriptions.map((d, i) => `${i + 1}. ${d}`).join('\n\n')}`
        : '';

      newResponses[stepId] = {
        ...newResponses[stepId],
        status: strengthToStatus(avgStrength),
        notes: notesText,
      };
      newAutoFilled.add(stepId);
    }

    setResponses(newResponses);
    setAutoFilledSteps(newAutoFilled);
  }, [collectEvidence, responses, autoFilledSteps]);

  const handleAutoFillCurrent = useCallback(async () => {
    let data = evidenceResult;
    if (!data) {
      data = await collectEvidence(false);
    }
    if (!data?.success || !step?.criteriaCode) return;

    const stepId = step.id;
    const subControls = getCriteriaSubControls(step.criteriaCode);
    const summaries = subControls.map(sc => data!.summary[sc]).filter(Boolean);

    const descriptions = summaries.flatMap(s => s.descriptions);
    const totalCount = summaries.reduce((s, x) => s + x.count, 0);
    const avgStrength = totalCount === 0 ? 'none' as const
      : totalCount <= summaries.length ? 'weak' as const
      : totalCount <= summaries.length * 3 ? 'moderate' as const
      : 'strong' as const;

    const notesText = descriptions.length > 0
      ? `[Auto-preenchido em ${new Date().toLocaleString('pt-BR')}]\n\n${descriptions.map((d, i) => `${i + 1}. ${d}`).join('\n\n')}`
      : 'Nenhuma evidência encontrada automaticamente. Preencha manualmente.';

    updateResponse(stepId, 'status', strengthToStatus(avgStrength));
    updateResponse(stepId, 'notes', notesText);
    setAutoFilledSteps(prev => new Set(prev).add(stepId));
  }, [evidenceResult, collectEvidence, step]);

  const handleSave = async () => {
    if (!tenant?.id) return;
    setSaving(true);
    try {
      for (const criteria of SOC2_TRUST_CRITERIA) {
        const stepId = `criteria-${criteria.code}`;
        const r = responses[stepId];
        if (!r) continue;

        const { error } = await supabase
          .from('soc2_criteria')
          .upsert({
            tenant_id: tenant.id,
            criteria_code: criteria.code,
            criteria_name: criteria.name,
            status: r.status || 'in_progress',
            implementation_notes: r.notes || '',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'tenant_id,criteria_code' });

        if (error) logger.error(`Error saving criteria ${criteria.code}`, { error: error.message });

        await supabase
          .from('soc2_control_status')
          .insert({
            tenant_id: tenant.id,
            control_id: criteria.code,
            status: r.status || 'not_started',
            notes: r.notes || '',
            filled_by: (await supabase.auth.getUser()).data.user?.id,
            auto_filled: autoFilledSteps.has(stepId),
          });
      }

      for (const policy of COMPLIANCE_POLICIES) {
        const stepId = `policy-${policy.code}`;
        const r = responses[stepId];
        if (!r) continue;

        const { error } = await supabase
          .from('compliance_policies')
          .upsert({
            tenant_id: tenant.id,
            policy_code: policy.code,
            policy_name: policy.name,
            status: r.status || 'draft',
            version: r.version || '1.0',
            owner: r.owner || '',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'tenant_id,policy_code' });

        if (error) logger.error(`Error saving policy ${policy.code}`, { error: error.message });
      }

      queryClient.invalidateQueries({ queryKey: ['soc2-readiness'] });
      toast.success('Progresso de conformidade salvo com sucesso!');
    } catch {
      toast.error('Erro ao salvar progresso');
    } finally {
      setSaving(false);
    }
  };

  return {
    steps,
    step,
    currentStep,
    setCurrentStep,
    progress,
    responses,
    updateResponse,
    isStepComplete,
    completedSteps,
    saving,
    autoFilledSteps,
    isCollecting,
    evidenceResult,
    getCriteriaStrength,
    getStrengthEmoji,
    handleAutoFillAll,
    handleAutoFillCurrent,
    handleSave,
  };
}
