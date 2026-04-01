import { servePublic } from '../_shared/serve-tenant.ts';
import { getProviderStatus, getActiveProviders, resetProviderCircuit, getProviderScores, type AIProviderName } from '../_shared/ai-multi-provider.ts';

function getDisplayName(provider: AIProviderName): string {
  const names: Record<AIProviderName, string> = {
    'google-gemini': 'Google Gemini 2.5 Flash',
    'groq': 'Groq (Llama 3.3-70B)',
    'openrouter': 'OpenRouter (Gemini 2.0 Free)',
    'cerebras': 'Cerebras (Llama 3.3-70B)',
    'mistral': 'Mistral AI (Small 3.1)',
    'lovable': 'CyberShield AI (Gemini 2.5 Flash)',
  };
  return names[provider] || provider;
}

servePublic(async (req, _ctx) => {
  const providerStatus = getProviderStatus();
  const activeProviders = getActiveProviders();

  if (req.method === 'POST') {
    const body = await req.json();
    const { z } = await import('https://esm.sh/zod@3.23.8');
    const PostSchema = z.object({
      action: z.enum(['reset_circuit']),
      provider: z.string().min(1).max(100),
    });
    const parsed = PostSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid input', issues: parsed.error.flatten().fieldErrors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const { provider, action } = parsed.data;

    if (action === 'reset_circuit') {
      resetProviderCircuit(provider as AIProviderName);
      return {
        success: true,
        message: `Circuit reset for ${provider}`,
        providerStatus: getProviderStatus(),
      };
    }
  }

  const enabledProviders = Object.entries(providerStatus).filter(([_, s]) => s.enabled);
  const healthyProviders = enabledProviders.filter(([_, s]) => !s.circuitOpen);
  const unhealthyProviders = enabledProviders.filter(([_, s]) => s.circuitOpen);

  const healthScore = enabledProviders.length > 0
    ? Math.round((healthyProviders.length / enabledProviders.length) * 100)
    : 0;

  return {
    timestamp: new Date().toISOString(),
    healthScore,
    summary: {
      totalProviders: Object.keys(providerStatus).length,
      enabledProviders: enabledProviders.length,
      healthyProviders: healthyProviders.length,
      unhealthyProviders: unhealthyProviders.length,
    },
    activeProviders,
    providers: Object.entries(providerStatus).map(([name, status]) => ({
      name,
      displayName: getDisplayName(name as AIProviderName),
      ...status,
      status: !status.enabled ? 'disabled' : status.circuitOpen ? 'circuit_open' : 'healthy',
    })),
    scores: getProviderScores(),
  };
}, { methods: ['GET', 'POST'] });
