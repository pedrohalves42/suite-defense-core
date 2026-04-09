import { type CriteriaCode, type PolicyDefinition } from '@/types/soc2-compliance';
import { type ControlSummary, type EvidenceCollectionResult } from '@/hooks/useSOC2EvidenceCollector';

export interface WizardStep {
  id: string;
  title: string;
  description: string;
  type: 'criteria' | 'policy' | 'evidence' | 'review';
  criteriaCode?: CriteriaCode;
  policyDef?: PolicyDefinition;
}

export type WizardResponses = Record<string, Record<string, string>>;

export interface WizardStepProps {
  step: WizardStep;
  stepData: Record<string, string>;
  updateResponse: (stepId: string, field: string, value: string) => void;
  isAutoFilled: boolean;
  isCollecting: boolean;
  onAutoFillCurrent: () => void;
  getCriteriaStrength: (code: CriteriaCode) => ControlSummary | null;
  getStrengthEmoji: (strength: ControlSummary['strength']) => string;
}

export interface FinalReviewProps {
  steps: WizardStep[];
  isStepComplete: (stepId: string) => boolean;
  autoFilledSteps: Set<string>;
  completedSteps: number;
  saving: boolean;
  onSave: () => void;
  getCriteriaStrength: (code: CriteriaCode) => ControlSummary | null;
  getStrengthEmoji: (strength: ControlSummary['strength']) => string;
}

export interface IntroStepProps {
  isCollecting: boolean;
  onAutoFillAll: () => void;
}
