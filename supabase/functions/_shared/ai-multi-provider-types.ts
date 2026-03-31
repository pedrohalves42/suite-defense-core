/**
 * AI Multi-Provider Types
 */

export type AIProviderName = 
  | 'google-gemini' 
  | 'groq' 
  | 'openrouter' 
  | 'cerebras'
  | 'mistral'
  | 'lovable';

export interface AIProviderConfig {
  name: AIProviderName;
  displayName: string;
  baseUrl: string;
  model: string;
  headers: () => Record<string, string>;
  enabled: () => boolean;
  priority: number;
  maxTokens: number;
  costPerMToken: number;
  weight: number;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionRequest {
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
  functionName?: string;
  tenantId?: string;
}

export interface AICompletionResponse {
  content: string;
  provider: AIProviderName;
  model: string;
  tokensUsed?: {
    prompt?: number;
    completion?: number;
    total?: number;
  };
  latencyMs: number;
  usedFallback: boolean;
  error?: string;
}

export interface ProviderStats {
  avgLatencyMs: number;
  requests: number;
  failures: number;
  lastUpdated: number;
}

export interface CircuitState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}
