/**
 * AI Provider Helper - Backwards Compatible Bridge
 * 
 * This file provides a drop-in replacement for direct platform AI calls,
 * routing them through the multi-provider system while maintaining
 * backwards compatibility with existing code.
 * 
 * Usage (in existing edge functions):
 * 
 * BEFORE:
 * const response = await fetch('https://ai.gateway.example.com/v1/chat/completions', {...});
 * 
 * AFTER:
 * import { callAI, callAIWithFallback } from '../_shared/ai-provider-helper.ts';
 * const result = await callAI(messages, { model, maxTokens, functionName, tenantId });
 */

import { 
  aiComplete, 
  aiSimpleComplete, 
  aiJsonComplete,
  getProviderStatus,
  getActiveProviders,
  type AIMessage,
  type AICompletionResponse,
  type AIProviderName 
} from './ai-multi-provider.ts';
import { sanitizeForAI, sanitizeObjectForAI } from './ai-sanitizer.ts';
import { createMetricsLogger, extractTokenUsage, type AIInferenceMetrics } from './ai-metrics.ts';
import { persistAIMetrics } from './ai-metrics-persistence.ts';

export interface AICallOptions {
  model?: string;          // Ignored - multi-provider selects automatically
  maxTokens?: number;
  temperature?: number;    // Ignored - each provider has defaults
  functionName?: string;
  tenantId?: string;
}

export interface AICallResult {
  success: boolean;
  content: string;
  error?: string;
  provider: AIProviderName;
  model: string;
  latencyMs: number;
  tokensUsed?: {
    prompt?: number;
    completion?: number;
    total?: number;
  };
  usedFallback: boolean;
}

/**
 * Call AI with multi-provider routing (drop-in replacement)
 */
export async function callAI(
  messages: AIMessage[],
  options: AICallOptions = {}
): Promise<AICallResult> {
  const { maxTokens = 1024, functionName = 'unknown', tenantId } = options;
  
  const response = await aiComplete({
    messages,
    maxTokens,
    functionName,
    tenantId,
  });
  
  // Persist metrics if function name provided
  if (functionName !== 'unknown') {
    const metrics: AIInferenceMetrics = {
      timestamp: new Date().toISOString(),
      function_name: functionName,
      model: response.model,
      latency_ms: response.latencyMs,
      success: !response.error,
      tenant_id: tenantId,
      tokens_prompt: response.tokensUsed?.prompt,
      tokens_completion: response.tokensUsed?.completion,
      tokens_total: response.tokensUsed?.total,
      used_fallback: response.usedFallback,
    };
    
    // Fire and forget - don't await
    persistAIMetrics(metrics).catch(err => 
      console.warn('[ai-provider-helper] Failed to persist metrics:', err)
    );
  }
  
  return {
    success: !response.error,
    content: response.content,
    error: response.error,
    provider: response.provider,
    model: response.model,
    latencyMs: response.latencyMs,
    tokensUsed: response.tokensUsed,
    usedFallback: response.usedFallback,
  };
}

/**
 * Simple text completion (system + user prompt)
 */
export async function callAISimple(
  systemPrompt: string,
  userPrompt: string,
  options: AICallOptions = {}
): Promise<AICallResult> {
  const messages: AIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
  
  return callAI(messages, options);
}

/**
 * JSON completion with automatic parsing
 */
export async function callAIJson<T = unknown>(
  systemPrompt: string,
  userPrompt: string,
  options: AICallOptions = {}
): Promise<{ data: T | null; result: AICallResult }> {
  const result = await callAISimple(systemPrompt, userPrompt, options);
  
  if (!result.success || !result.content) {
    return { data: null, result };
  }
  
  try {
    // Try to extract JSON from the response
    let jsonStr = result.content;
    
    // Handle markdown code blocks
    const jsonMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    } else {
      // Try to find JSON object in response
      const objMatch = result.content.match(/\{[\s\S]*\}/);
      if (objMatch) {
        jsonStr = objMatch[0];
      }
    }
    
    const data = JSON.parse(jsonStr) as T;
    return { data, result };
  } catch (parseError) {
    console.warn('[ai-provider-helper] Failed to parse JSON response:', parseError);
    return {
      data: null,
      result: {
        ...result,
        error: `JSON parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      },
    };
  }
}

/**
 * Sanitize input and call AI (combines sanitization with call)
 */
export async function callAISanitized(
  systemPrompt: string,
  userPromptRaw: string,
  options: AICallOptions = {}
): Promise<AICallResult> {
  const sanitizeResult = sanitizeForAI(userPromptRaw);
  
  if (sanitizeResult.blocked) {
    console.warn(`[ai-provider-helper] Prompt injection blocked in ${options.functionName}:`, 
      sanitizeResult.blockedPatterns);
  }
  
  return callAISimple(systemPrompt, sanitizeResult.sanitized, options);
}

/**
 * Get current provider health status
 */
export function getAIProviderHealth(): {
  activeProviders: AIProviderName[];
  providerStatus: Record<AIProviderName, { enabled: boolean; circuitOpen: boolean; failures: number }>;
} {
  return {
    activeProviders: getActiveProviders(),
    providerStatus: getProviderStatus(),
  };
}

// Re-export types for convenience
export type { AIMessage, AICompletionResponse, AIProviderName } from './ai-multi-provider.ts';
