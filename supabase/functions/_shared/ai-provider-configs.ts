/**
 * AI Provider Configurations
 */
import type { AIProviderConfig } from './ai-multi-provider-types.ts';

export const PROVIDERS: AIProviderConfig[] = [
  {
    name: 'groq',
    displayName: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    headers: () => ({
      'Authorization': `Bearer ${Deno.env.get('GROQ_API_KEY')}`,
      'Content-Type': 'application/json',
    }),
    enabled: () => !!Deno.env.get('GROQ_API_KEY'),
    priority: 1,
    maxTokens: 8000,
    costPerMToken: 0,
    weight: 30,
  },
  {
    name: 'cerebras',
    displayName: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1/chat/completions',
    model: 'llama-3.3-70b',
    headers: () => ({
      'Authorization': `Bearer ${Deno.env.get('CEREBRAS_API_KEY')}`,
      'Content-Type': 'application/json',
    }),
    enabled: () => !!Deno.env.get('CEREBRAS_API_KEY'),
    priority: 2,
    maxTokens: 8192,
    costPerMToken: 0,
    weight: 20,
  },
  {
    name: 'openrouter',
    displayName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'google/gemini-2.0-flash-exp:free',
    headers: () => ({
      'Authorization': `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://cybershield.app',
      'X-Title': 'CyberShield',
    }),
    enabled: () => !!Deno.env.get('OPENROUTER_API_KEY'),
    priority: 3,
    maxTokens: 8192,
    costPerMToken: 0,
    weight: 15,
  },
  {
    name: 'google-gemini',
    displayName: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    model: 'gemini-2.5-flash',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    enabled: () => !!Deno.env.get('GOOGLE_GEMINI_API_KEY'),
    priority: 4,
    maxTokens: 8192,
    costPerMToken: 0.075,
    weight: 15,
  },
  {
    name: 'mistral',
    displayName: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1/chat/completions',
    model: 'mistral-small-latest',
    headers: () => ({
      'Authorization': `Bearer ${Deno.env.get('MISTRAL_API_KEY')}`,
      'Content-Type': 'application/json',
    }),
    enabled: () => !!Deno.env.get('MISTRAL_API_KEY'),
    priority: 5,
    maxTokens: 8192,
    costPerMToken: 0,
    weight: 10,
  },
  {
    name: 'lovable',
    displayName: 'Platform AI',
    baseUrl: 'https://ai.gateway.lovable.dev/v1/chat/completions',
    model: 'google/gemini-3-flash-preview',
    headers: () => ({
      'Authorization': `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`,
      'Content-Type': 'application/json',
    }),
    enabled: () => !!Deno.env.get('LOVABLE_API_KEY'),
    priority: 6,
    maxTokens: 8192,
    costPerMToken: 0.10,
    weight: 0, // Emergency-only
  },
];
