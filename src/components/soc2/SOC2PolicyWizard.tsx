/**
 * Assistente Guiado para Preenchimento de Políticas SOC 2
 * Fase 2: Integrado com soc2-evidence-collector para auto-preenchimento
 */

import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, ChevronLeft, ChevronRight, FileText, AlertTriangle, Shield, Sparkles, Bot, Loader2 } from 'lucide-react';
import { SOC2_TRUST_CRITERIA, COMPLIANCE_POLICIES, type CriteriaCode, type PolicyDefinition } from '@/types/soc2-compliance';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { useQueryClient } from '@tanstack/react-query';
import { useSOC2EvidenceCollector, type EvidenceCollectionResult, type ControlSummary } from '@/hooks/useSOC2EvidenceCollector';

interface WizardStep {
  id: string;
  title: string;
  description: string;
  type: 'criteria' | 'policy' | 'evidence' | 'review';
  criteriaCode?: CriteriaCode;
  policyDef?: PolicyDefinition;
}

// Map evidence strength to wizard status
function strengthToStatus(strength: ControlSummary['strength']): string {
  switch (strength) {
    case 'strong': return 'implemented';
    case 'moderate': return 'in_progress';
    default: return 'not_started';
  }
}

// Map criteria code (CC1) to sub-controls (CC1.1, CC1.2, etc.)
function getCriteriaSubControls(criteriaCode: CriteriaCode): string[] {
  const criteria = SOC2_TRUST_CRITERIA.find(c => c.code === criteriaCode);
  if (!criteria) return [];
  return criteria.controls.map(c => c.code);
}

function buildWizardSteps(): WizardStep[] {
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

export function SOC2PolicyWizard() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(0);
  const [responses, setResponses] = useState<Record<string, Record<string, string>>>({});
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

  // Get strength for a criteria from cached evidence result
  const getCriteriaStrength = useCallback((criteriaCode: CriteriaCode): ControlSummary | null => {
    if (!evidenceResult?.summary) return null;
    // Sum up sub-controls (CC1.1, CC1.2, etc.)
    const subControls = getCriteriaSubControls(criteriaCode);
    const summaries = subControls
      .map(sc => evidenceResult.summary[sc])
      .filter(Boolean);
    
    if (summaries.length === 0) return null;

    const totalCount = summaries.reduce((s, x) => s + x.count, 0);
    const allDescriptions = summaries.flatMap(x => x.descriptions);
    const avgStrength = totalCount === 0 ? 'none' as const
      : totalCount <= summaries.length ? 'weak' as const
      : totalCount <= summaries.length * 3 ? 'moderate' as const
      : 'strong' as const;

    return { count: totalCount, strength: avgStrength, descriptions: allDescriptions };
  }, [evidenceResult]);

  // Auto-fill ALL criteria steps from a single evidence collection call
  const handleAutoFillAll = useCallback(async () => {
    const data = await collectEvidence(true); // save=true to persist
    if (!data?.success) return;

    const newResponses = { ...responses };
    const newAutoFilled = new Set(autoFilledSteps);

    for (const criteria of SOC2_TRUST_CRITERIA) {
      const stepId = `criteria-${criteria.code}`;
      const subControls = getCriteriaSubControls(criteria.code);
      const summaries = subControls
        .map(sc => data.summary[sc])
        .filter(Boolean);

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

  // Auto-fill current step only (uses cached result if available)
  const handleAutoFillCurrent = useCallback(async () => {
    let data = evidenceResult;
    if (!data) {
      data = await collectEvidence(false);
    }
    if (!data?.success || !step?.criteriaCode) return;

    const stepId = step.id;
    const subControls = getCriteriaSubControls(step.criteriaCode);
    const summaries = subControls
      .map(sc => data!.summary[sc])
      .filter(Boolean);

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
      // Save criteria implementation notes
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

        // Save to soc2_control_status for history tracking
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

      // Save policy statuses
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
    } catch (e) {
      toast.error('Erro ao salvar progresso');
    } finally {
      setSaving(false);
    }
  };

  // Strength badge component
  const StrengthBadge = ({ criteriaCode }: { criteriaCode: CriteriaCode }) => {
    const summary = getCriteriaStrength(criteriaCode);
    if (!summary) return null;
    const emoji = getStrengthEmoji(summary.strength);
    const labels: Record<ControlSummary['strength'], string> = {
      strong: 'Forte',
      moderate: 'Moderado',
      weak: 'Fraco',
      none: 'Sem dados',
    };
    const variants: Record<ControlSummary['strength'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
      strong: 'default',
      moderate: 'secondary',
      weak: 'destructive',
      none: 'outline',
    };
    return (
      <Badge variant={variants[summary.strength]} className="text-xs">
        {emoji} {labels[summary.strength]} ({summary.count})
      </Badge>
    );
  };

  const renderStepContent = () => {
    if (!step) return null;
    const stepData = responses[step.id] || {};

    if (step.id === 'intro') {
      return (
        <div className="space-y-6 text-center py-8">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h3 className="text-2xl font-bold">Assistente de Conformidade SOC 2</h3>
            <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
              Vamos guiá-lo passo a passo pelo preenchimento dos 9 critérios de confiança (CC1-CC9) e 9 políticas organizacionais necessárias para a auditoria SOC 2 Type I.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
            <div className="p-3 rounded-lg bg-muted/50">
              <Shield className="h-5 w-5 mx-auto text-primary" />
              <p className="text-xs mt-1">9 Critérios</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <FileText className="h-5 w-5 mx-auto text-primary" />
              <p className="text-xs mt-1">9 Políticas</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <CheckCircle2 className="h-5 w-5 mx-auto text-primary" />
              <p className="text-xs mt-1">30 Controles</p>
            </div>
          </div>
          
          {/* Auto-fill all button on intro */}
          <div className="pt-4 border-t max-w-md mx-auto">
            <Button
              onClick={handleAutoFillAll}
              disabled={isCollecting}
              className="w-full gap-2"
              variant="default"
            >
              {isCollecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Bot className="h-4 w-4" />
              )}
              {isCollecting ? 'Coletando evidências...' : '🤖 Auto-preencher todos os critérios'}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Coleta evidências reais do sistema e preenche automaticamente notas e status de cada critério.
            </p>
          </div>
        </div>
      );
    }

    if (step.id === 'final-review') {
      return (
        <div className="space-y-4">
          <div className="text-center py-4">
            <h3 className="text-xl font-bold">Revisão Final</h3>
            <p className="text-muted-foreground">
              Você preencheu {completedSteps} de {steps.length - 2} seções.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {steps.filter(s => s.type === 'criteria').map(s => (
              <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                {isStepComplete(s.id) ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
                )}
                <span className="text-sm flex-1">{s.title}</span>
                {s.criteriaCode && <StrengthBadge criteriaCode={s.criteriaCode} />}
                {autoFilledSteps.has(s.id) && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Bot className="h-3 w-3" /> Auto
                  </Badge>
                )}
              </div>
            ))}
            {steps.filter(s => s.type === 'policy').map(s => (
              <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                {isStepComplete(s.id) ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
                )}
                <span className="text-sm">{s.title}</span>
              </div>
            ))}
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full mt-4">
            {saving ? 'Salvando...' : 'Salvar Progresso de Conformidade'}
          </Button>
        </div>
      );
    }

    if (step.type === 'criteria' && step.criteriaCode) {
      const criteria = SOC2_TRUST_CRITERIA.find(c => c.code === step.criteriaCode)!;
      const isAutoFilled = autoFilledSteps.has(step.id);
      return (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="font-semibold text-lg">{criteria.fullName}</h3>
              <p className="text-sm text-muted-foreground">{criteria.objective}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StrengthBadge criteriaCode={step.criteriaCode} />
              <Button
                size="sm"
                variant="outline"
                onClick={handleAutoFillCurrent}
                disabled={isCollecting}
                className="gap-1.5"
              >
                {isCollecting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Bot className="h-3.5 w-3.5" />
                )}
                Auto-preencher
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label>Status de Implementação</Label>
              <Select
                value={stepData.status || 'not_started'}
                onValueChange={(v) => updateResponse(step.id, 'status', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_started">🔴 Não Iniciado</SelectItem>
                  <SelectItem value="in_progress">🟡 Em Progresso</SelectItem>
                  <SelectItem value="implemented">🔵 Implementado</SelectItem>
                  <SelectItem value="verified">🟢 Verificado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <Label>Notas de Implementação</Label>
                {isAutoFilled && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Bot className="h-3 w-3" /> Auto-preenchido
                  </Badge>
                )}
              </div>
              <Textarea
                placeholder={`Descreva como o critério ${criteria.code} está implementado na sua organização...`}
                value={stepData.notes || ''}
                onChange={(e) => updateResponse(step.id, 'notes', e.target.value)}
                rows={6}
              />
              {isAutoFilled && (
                <p className="text-xs text-muted-foreground mt-1">
                  💡 Você pode editar livremente as notas auto-preenchidas.
                </p>
              )}
            </div>
          </div>

          <div className="border rounded-lg p-3 bg-muted/30">
            <h4 className="text-sm font-medium mb-2">Controles CyberShield ({criteria.controls.length})</h4>
            <div className="space-y-1.5">
              {criteria.controls.map(ctrl => (
                <div key={ctrl.code} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  <span className="font-mono text-xs text-muted-foreground">{ctrl.code}</span>
                  <span>{ctrl.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (step.type === 'policy' && step.policyDef) {
      const policy = step.policyDef;
      return (
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-lg">{policy.name}</h3>
            <p className="text-sm text-muted-foreground">{policy.description}</p>
            <div className="flex gap-1 mt-2">
              {policy.soc2Criteria.map(c => (
                <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <Select
                value={stepData.status || 'draft'}
                onValueChange={(v) => updateResponse(step.id, 'status', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">📝 Rascunho</SelectItem>
                  <SelectItem value="review">🔍 Em Revisão</SelectItem>
                  <SelectItem value="approved">✅ Aprovada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Versão</Label>
              <Input
                value={stepData.version || '1.0'}
                onChange={(e) => updateResponse(step.id, 'version', e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Responsável</Label>
            <Input
              placeholder="Nome do responsável pela política"
              value={stepData.owner || ''}
              onChange={(e) => updateResponse(step.id, 'owner', e.target.value)}
            />
          </div>

          <div className="border rounded-lg p-3 bg-muted/30">
            <h4 className="text-sm font-medium mb-1">Seções Necessárias</h4>
            <ul className="space-y-1">
              {policy.sections.map(s => (
                <li key={s} className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <FileText className="h-3 w-3 shrink-0" /> {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Assistente de Conformidade SOC 2
            </CardTitle>
            <CardDescription>
              Passo {currentStep + 1} de {steps.length} — {step?.title}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {evidenceResult && (
              <Badge variant="outline" className="text-xs gap-1 bg-primary/5">
                <Bot className="h-3 w-3" />
                {evidenceResult.evidence.length} evidências
              </Badge>
            )}
            <Badge variant="outline" className="text-sm">
              {completedSteps}/{steps.length - 2} preenchidos
            </Badge>
          </div>
        </div>
        <Progress value={progress} className="mt-2" />
      </CardHeader>

      <CardContent className="min-h-[300px]">
        {renderStepContent()}
      </CardContent>

      <CardFooter className="flex justify-between border-t pt-4">
        <Button
          variant="outline"
          onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
          disabled={currentStep === 0}
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
        </Button>
        <span className="text-sm text-muted-foreground">
          {currentStep + 1} / {steps.length}
        </span>
        <Button
          onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
          disabled={currentStep === steps.length - 1}
        >
          Próximo <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </CardFooter>
    </Card>
  );
}
