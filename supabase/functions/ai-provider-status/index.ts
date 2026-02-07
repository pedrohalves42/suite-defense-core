import { getProviderStatus, getActiveProviders, resetProviderCircuit, type AIProviderName } from '../_shared/ai-multi-provider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const providerStatus = getProviderStatus();
    const activeProviders = getActiveProviders();
    
    // Handle POST for circuit reset
    if (req.method === 'POST') {
      const { provider, action } = await req.json();
      
      if (action === 'reset_circuit' && provider) {
        resetProviderCircuit(provider as AIProviderName);
        return new Response(JSON.stringify({ 
          success: true, 
          message: `Circuit reset for ${provider}`,
          providerStatus: getProviderStatus(),
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Calculate health summary
    const enabledProviders = Object.entries(providerStatus).filter(([_, s]) => s.enabled);
    const healthyProviders = enabledProviders.filter(([_, s]) => !s.circuitOpen);
    const unhealthyProviders = enabledProviders.filter(([_, s]) => s.circuitOpen);
    
    const healthScore = enabledProviders.length > 0
      ? Math.round((healthyProviders.length / enabledProviders.length) * 100)
      : 0;

    return new Response(JSON.stringify({
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
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-provider-status:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function getDisplayName(provider: AIProviderName): string {
  const names: Record<AIProviderName, string> = {
    'google-gemini': 'Google Gemini',
    'groq': 'Groq',
    'openrouter': 'OpenRouter',
    'cloudflare': 'Cloudflare Workers AI',
    'manaus-ia': 'Manaus IA',
    'lovable': 'Lovable AI (Fallback)',
  };
  return names[provider] || provider;
}
