import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, Shield, FileText, Sparkles, Bot, Loader2 } from 'lucide-react';
import { type IntroStepProps, type FinalReviewProps, type WizardStep } from './types';
import { type CriteriaCode } from '@/types/soc2-compliance';
import { type ControlSummary } from '@/hooks/useSOC2EvidenceCollector';

function StrengthBadge({ criteriaCode, getCriteriaStrength, getStrengthEmoji }: {
  criteriaCode: CriteriaCode;
  getCriteriaStrength: (code: CriteriaCode) => ControlSummary | null;
  getStrengthEmoji: (strength: ControlSummary['strength']) => string;
}) {
  const summary = getCriteriaStrength(criteriaCode);
  if (!summary) return null;
  const emoji = getStrengthEmoji(summary.strength);
  const labels: Record<ControlSummary['strength'], string> = {
    strong: 'Forte', moderate: 'Moderado', weak: 'Fraco', none: 'Sem dados',
  };
  const variants: Record<ControlSummary['strength'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
    strong: 'default', moderate: 'secondary', weak: 'destructive', none: 'outline',
  };
  return (
    <Badge variant={variants[summary.strength]} className="text-xs">
      {emoji} {labels[summary.strength]} ({summary.count})
    </Badge>
  );
}

export function IntroStep({ isCollecting, onAutoFillAll }: IntroStepProps) {
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
      <div className="pt-4 border-t max-w-md mx-auto">
        <Button onClick={onAutoFillAll} disabled={isCollecting} className="w-full gap-2" variant="default">
          {isCollecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
          {isCollecting ? 'Coletando evidências...' : '🤖 Auto-preencher todos os critérios'}
        </Button>
        <p className="text-xs text-muted-foreground mt-2">
          Coleta evidências reais do sistema e preenche automaticamente notas e status de cada critério.
        </p>
      </div>
    </div>
  );
}

export function FinalReviewStep({ steps, isStepComplete, autoFilledSteps, completedSteps, saving, onSave, getCriteriaStrength, getStrengthEmoji }: FinalReviewProps) {
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
            {s.criteriaCode && <StrengthBadge criteriaCode={s.criteriaCode} getCriteriaStrength={getCriteriaStrength} getStrengthEmoji={getStrengthEmoji} />}
            {autoFilledSteps.has(s.id) && (
              <Badge variant="secondary" className="text-xs gap-1"><Bot className="h-3 w-3" /> Auto</Badge>
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
      <Button onClick={onSave} disabled={saving} className="w-full mt-4">
        {saving ? 'Salvando...' : 'Salvar Progresso de Conformidade'}
      </Button>
    </div>
  );
}
