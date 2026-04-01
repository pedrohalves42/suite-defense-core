/**
 * AI Prompt Registry - Shared types
 */
export type PromptScope = 'system_governance' | 'security' | 'operations' | 'support';
export type PromptPosture = 'conservative' | 'neutral' | 'hostile';

export interface PromptDefinition {
  content: string;
  version: string;
  description: string;
  scope: PromptScope;
  posture: PromptPosture;
  mutable: boolean;
}

export interface PromptVersion extends PromptDefinition {
  id: string;
  hash: string;
  created_at: string;
  deprecated: boolean;
}
