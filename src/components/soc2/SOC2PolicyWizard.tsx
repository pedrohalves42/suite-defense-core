/**
 * Assistente Guiado para Preenchimento de Políticas SOC 2
 * Decomposed: hook (useSOC2Wizard), types, StepContent, ReviewSteps
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ChevronLeft, ChevronRight, Sparkles, Bot } from 'lucide-react';
import { useSOC2Wizard } from './wizard/useSOC2Wizard';
import { IntroStep, FinalReviewStep } from './wizard/ReviewSteps';
import { CriteriaStepContent, PolicyStepContent } from './wizard/StepContent';

export function SOC2PolicyWizard() {
  const {
    steps, step, currentStep, setCurrentStep, progress,
    responses, updateResponse, isStepComplete, completedSteps,
    saving, autoFilledSteps, isCollecting, evidenceResult,
    getCriteriaStrength, getStrengthEmoji,
    handleAutoFillAll, handleAutoFillCurrent, handleSave,
  } = useSOC2Wizard();

  const renderStepContent = () => {
    if (!step) return null;
    const stepData = responses[step.id] || {};

    if (step.id === 'intro') {
      return <IntroStep isCollecting={isCollecting} onAutoFillAll={handleAutoFillAll} />;
    }

    if (step.id === 'final-review') {
      return (
        <FinalReviewStep
          steps={steps}
          isStepComplete={isStepComplete}
          autoFilledSteps={autoFilledSteps}
          completedSteps={completedSteps}
          saving={saving}
          onSave={handleSave}
          getCriteriaStrength={getCriteriaStrength}
          getStrengthEmoji={getStrengthEmoji}
        />
      );
    }

    if (step.type === 'criteria') {
      return (
        <CriteriaStepContent
          step={step}
          stepData={stepData}
          updateResponse={updateResponse}
          isAutoFilled={autoFilledSteps.has(step.id)}
          isCollecting={isCollecting}
          onAutoFillCurrent={handleAutoFillCurrent}
          getCriteriaStrength={getCriteriaStrength}
          getStrengthEmoji={getStrengthEmoji}
        />
      );
    }

    if (step.type === 'policy') {
      return <PolicyStepContent step={step} stepData={stepData} updateResponse={updateResponse} />;
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
        <Button variant="outline" onClick={() => setCurrentStep(Math.max(0, currentStep - 1))} disabled={currentStep === 0}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
        </Button>
        <span className="text-sm text-muted-foreground">{currentStep + 1} / {steps.length}</span>
        <Button onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))} disabled={currentStep === steps.length - 1}>
          Próximo <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </CardFooter>
    </Card>
  );
}
