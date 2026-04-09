import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, FileText, Bot, Loader2 } from 'lucide-react';
import { SOC2_TRUST_CRITERIA, type CriteriaCode } from '@/types/soc2-compliance';
import { type ControlSummary } from '@/hooks/useSOC2EvidenceCollector';
import { type WizardStepProps } from './types';

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

export function CriteriaStepContent({ step, stepData, updateResponse, isAutoFilled, isCollecting, onAutoFillCurrent, getCriteriaStrength, getStrengthEmoji }: WizardStepProps) {
  if (!step.criteriaCode) return null;
  const criteria = SOC2_TRUST_CRITERIA.find(c => c.code === step.criteriaCode)!;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="font-semibold text-lg">{criteria.fullName}</h3>
          <p className="text-sm text-muted-foreground">{criteria.objective}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StrengthBadge criteriaCode={step.criteriaCode} getCriteriaStrength={getCriteriaStrength} getStrengthEmoji={getStrengthEmoji} />
          <Button size="sm" variant="outline" onClick={onAutoFillCurrent} disabled={isCollecting} className="gap-1.5">
            {isCollecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
            Auto-preencher
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <Label>Status de Implementação</Label>
          <Select value={stepData.status || 'not_started'} onValueChange={(v) => updateResponse(step.id, 'status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
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
              <Badge variant="secondary" className="text-xs gap-1"><Bot className="h-3 w-3" /> Auto-preenchido</Badge>
            )}
          </div>
          <Textarea
            placeholder={`Descreva como o critério ${criteria.code} está implementado na sua organização...`}
            value={stepData.notes || ''}
            onChange={(e) => updateResponse(step.id, 'notes', e.target.value)}
            rows={6}
          />
          {isAutoFilled && (
            <p className="text-xs text-muted-foreground mt-1">💡 Você pode editar livremente as notas auto-preenchidas.</p>
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

export function PolicyStepContent({ step, stepData, updateResponse }: Pick<WizardStepProps, 'step' | 'stepData' | 'updateResponse'>) {
  if (!step.policyDef) return null;
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
          <Select value={stepData.status || 'draft'} onValueChange={(v) => updateResponse(step.id, 'status', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">📝 Rascunho</SelectItem>
              <SelectItem value="review">🔍 Em Revisão</SelectItem>
              <SelectItem value="approved">✅ Aprovada</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Versão</Label>
          <Input value={stepData.version || '1.0'} onChange={(e) => updateResponse(step.id, 'version', e.target.value)} />
        </div>
      </div>

      <div>
        <Label>Responsável</Label>
        <Input placeholder="Nome do responsável pela política" value={stepData.owner || ''} onChange={(e) => updateResponse(step.id, 'owner', e.target.value)} />
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
